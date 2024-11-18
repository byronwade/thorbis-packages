import type { FormData, FormFieldInteraction } from '../../types';

export class FormsTracker {
  private analytics: any;
  private forms: Map<
    string,
    {
      startTime: number;
      fields: Map<string, FormFieldInteraction>;
    }
  > = new Map();

  constructor(analytics: any) {
    this.analytics = analytics;
    this.handleFormInteraction = this.handleFormInteraction.bind(this);
    this.handleFormSubmit = this.handleFormSubmit.bind(this);
    this.handleFormAbandonment = this.handleFormAbandonment.bind(this);
  }

  init() {
    if (typeof window === 'undefined') return;

    // Find all forms and attach listeners
    document.querySelectorAll('form').forEach((form) => {
      this.initializeFormTracking(form);
    });

    // Watch for dynamically added forms
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLFormElement) {
            this.initializeFormTracking(node);
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  private initializeFormTracking(form: HTMLFormElement) {
    const formId = form.id || `form-${Math.random().toString(36).slice(2)}`;

    this.forms.set(formId, {
      startTime: Date.now(),
      fields: new Map(),
    });

    // Track field interactions
    form.addEventListener('focus', this.handleFormInteraction, true);
    form.addEventListener('blur', this.handleFormInteraction, true);
    form.addEventListener('input', this.handleFormInteraction, true);
    form.addEventListener('submit', this.handleFormSubmit);

    // Track form abandonment
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.handleFormAbandonment(formId);
      }
    });
  }

  private handleFormInteraction(event: Event) {
    const target = event.target as HTMLInputElement;
    if (!target.form) return;

    const formId = target.form.id;
    const fieldId = target.id || target.name;
    const formData = this.forms.get(formId);

    if (formData && fieldId) {
      const fieldData = formData.fields.get(fieldId) || {
        fieldId,
        timeSpent: 0,
        completed: false,
      };

      if (event.type === 'focus') {
        fieldData.timeSpent = Date.now();
      } else if (event.type === 'blur') {
        fieldData.timeSpent += Date.now() - (fieldData.timeSpent || Date.now());
        fieldData.completed = Boolean(target.value);
      }

      formData.fields.set(fieldId, fieldData);
    }
  }

  private handleFormSubmit(event: Event) {
    const form = event.target as HTMLFormElement;
    const formId = form.id;
    const formData = this.forms.get(formId);

    if (formData) {
      this.trackFormCompletion(formId, false);
    }
  }

  private handleFormAbandonment(formId: string) {
    this.trackFormCompletion(formId, true);
  }

  private trackFormCompletion(formId: string, abandoned: boolean) {
    const formData = this.forms.get(formId);
    if (!formData) return;

    const data: FormData = {
      formId,
      fields: Array.from(formData.fields.values()),
      timeSpent: Date.now() - formData.startTime,
      abandoned,
    };

    this.analytics.track('formInteraction', data);
  }

  cleanup() {
    document.querySelectorAll('form').forEach((form) => {
      form.removeEventListener('focus', this.handleFormInteraction, true);
      form.removeEventListener('blur', this.handleFormInteraction, true);
      form.removeEventListener('input', this.handleFormInteraction, true);
      form.removeEventListener('submit', this.handleFormSubmit);
    });
  }
}
