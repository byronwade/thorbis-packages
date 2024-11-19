import { BaseTracker } from './base';

interface FormField {
  name: string;
  type: string;
  value: string;
  valid: boolean;
  touched: boolean;
  errors?: string[];
}

interface FormInteraction {
  timestamp: number;
  type: 'focus' | 'blur' | 'input' | 'change' | 'submit' | 'error';
  fieldName: string;
  value?: string;
  duration?: number;
}

interface FormData {
  formId: string;
  formName?: string;
  action?: string;
  method?: string;
  fields: FormField[];
  interactions: FormInteraction[];
  metrics: {
    startTime: number;
    completionTime?: number;
    totalTime?: number;
    interactionCount: number;
    errorCount: number;
    submissionAttempts: number;
    successfulSubmission: boolean;
    abandonmentRate?: number;
    fieldTimeSpent: Record<string, number>;
  };
  performance: {
    timeToFirstInteraction?: number;
    timeToCompletion?: number;
    validationTime?: number;
    submissionTime?: number;
  };
}

export class FormsTracker extends BaseTracker {
  private forms: Map<string, FormData> = new Map();
  private activeForm: string | null = null;
  private fieldFocusTime: Map<string, number> = new Map();
  private readonly DEBOUNCE_TIME = 150; // ms
  private debounceTimer: NodeJS.Timeout | null = null;
  private observer: MutationObserver | null = null;

  constructor(analytics: any) {
    super(analytics);
  }

  async init(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      // Initialize form tracking with passive listeners for better performance
      this.setupFormTracking();
      this.observeFormChanges();

      this.log('Forms tracker initialized');
    } catch (error) {
      console.error('Error initializing forms tracker:', error);
    }
  }

  getData(): any {
    const formsData = Array.from(this.forms.values());
    return {
      forms: formsData,
      summary: this.generateFormsSummary(formsData),
    };
  }

  cleanup(): void {
    try {
      this.removeFormListeners();
      if (this.observer) {
        this.observer.disconnect();
      }
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
    } catch (error) {
      console.error('Error cleaning up forms tracker:', error);
    }
  }

  private setupFormTracking(): void {
    // Track existing forms
    document.querySelectorAll('form').forEach((form) => {
      this.trackForm(form);
    });

    // Set up event delegation for better performance
    document.addEventListener('submit', this.handleFormSubmit, {
      passive: false,
    });
    document.addEventListener('focus', this.handleFieldFocus, {
      passive: true,
      capture: true,
    });
    document.addEventListener('blur', this.handleFieldBlur, {
      passive: true,
      capture: true,
    });
    document.addEventListener('input', this.handleFieldInput, {
      passive: true,
    });
    document.addEventListener('invalid', this.handleFieldError, {
      passive: true,
    });
  }

  private observeFormChanges(): void {
    // Observe DOM for dynamically added forms
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            const forms = node.getElementsByTagName('form');
            Array.from(forms).forEach((form) => this.trackForm(form));
          }
        });
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private trackForm(form: HTMLFormElement): void {
    const formId = form.id || this.generateFormId(form);
    if (this.forms.has(formId)) return;

    const formData: FormData = {
      formId,
      formName: form.getAttribute('name') || undefined,
      action: form.action,
      method: form.method,
      fields: this.getFormFields(form),
      interactions: [],
      metrics: {
        startTime: Date.now(),
        interactionCount: 0,
        errorCount: 0,
        submissionAttempts: 0,
        successfulSubmission: false,
        fieldTimeSpent: {},
      },
      performance: {},
    };

    this.forms.set(formId, formData);
    this.trackFormFields(form, formId);
  }

  private generateFormId(form: HTMLFormElement): string {
    const formContent = form.innerHTML.replace(/\s+/g, '');
    return `form_${Math.abs(this.hashCode(formContent))}`;
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash;
  }

  private getFormFields(form: HTMLFormElement): FormField[] {
    return Array.from(form.elements)
      .map((element) => {
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement
        ) {
          return {
            name: element.name || element.id,
            type: element.type || 'text',
            value: '',
            valid: element.validity.valid,
            touched: false,
          };
        }
        return null;
      })
      .filter((field): field is FormField => field !== null);
  }

  private trackFormFields(form: HTMLFormElement, formId: string): void {
    const formData = this.forms.get(formId);
    if (!formData) return;

    // Track initial field states
    Array.from(form.elements).forEach((element) => {
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) {
        formData.metrics.fieldTimeSpent[element.name || element.id] = 0;
      }
    });
  }

  private handleFormSubmit = (event: Event): void => {
    if (!(event.target instanceof HTMLFormElement)) return;
    const form = event.target;
    const formId = form.id || this.generateFormId(form);
    const formData = this.forms.get(formId);
    if (!formData) return;

    formData.metrics.submissionAttempts++;
    const isValid = form.checkValidity();

    if (isValid) {
      formData.metrics.successfulSubmission = true;
      formData.metrics.completionTime = Date.now();
      formData.metrics.totalTime =
        formData.metrics.completionTime - formData.metrics.startTime;

      this.analytics.track('formSubmission', {
        formId,
        metrics: formData.metrics,
        timestamp: new Date().toISOString(),
      });
    } else {
      formData.metrics.errorCount++;
      this.trackFormError(formId, 'submission', 'Form validation failed');
    }
  };

  private handleFieldFocus = (event: FocusEvent): void => {
    if (!this.isFormField(event.target)) return;
    const field = event.target;
    const form = field.closest('form');
    if (!form) return;

    const formId = form.id || this.generateFormId(form);
    const fieldName = field.name || field.id;
    this.fieldFocusTime.set(fieldName, Date.now());

    this.trackInteraction(formId, {
      type: 'focus',
      fieldName,
      timestamp: Date.now(),
    });
  };

  private handleFieldBlur = (event: FocusEvent): void => {
    if (!this.isFormField(event.target)) return;
    const field = event.target;
    const form = field.closest('form');
    if (!form) return;

    const formId = form.id || this.generateFormId(form);
    const fieldName = field.name || field.id;
    const focusTime = this.fieldFocusTime.get(fieldName);

    if (focusTime) {
      const duration = Date.now() - focusTime;
      this.trackInteraction(formId, {
        type: 'blur',
        fieldName,
        timestamp: Date.now(),
        duration,
      });
      this.updateFieldTimeSpent(formId, fieldName, duration);
    }
  };

  private handleFieldInput = (event: Event): void => {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      if (!this.isFormField(event.target)) return;
      const field = event.target;
      const form = field.closest('form');
      if (!form) return;

      const formId = form.id || this.generateFormId(form);
      this.trackInteraction(formId, {
        type: 'input',
        fieldName: field.name || field.id,
        timestamp: Date.now(),
        value: field.value,
      });
    }, this.DEBOUNCE_TIME);
  };

  private handleFieldError = (event: Event): void => {
    if (!this.isFormField(event.target)) return;
    const field = event.target;
    const form = field.closest('form');
    if (!form) return;

    const formId = form.id || this.generateFormId(form);
    const formData = this.forms.get(formId);
    if (!formData) return;

    formData.metrics.errorCount++;
    this.trackFormError(
      formId,
      field.name || field.id,
      field.validationMessage
    );
  };

  private isFormField(
    element: EventTarget | null
  ): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
    return (
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement
    );
  }

  private trackInteraction(formId: string, interaction: FormInteraction): void {
    const formData = this.forms.get(formId);
    if (!formData) return;

    formData.interactions.push(interaction);
    formData.metrics.interactionCount++;

    if (!formData.performance.timeToFirstInteraction) {
      formData.performance.timeToFirstInteraction =
        interaction.timestamp - formData.metrics.startTime;
    }
  }

  private trackFormError(
    formId: string,
    fieldName: string,
    message: string
  ): void {
    const formData = this.forms.get(formId);
    if (!formData) return;

    this.trackInteraction(formId, {
      type: 'error',
      fieldName,
      timestamp: Date.now(),
      value: message,
    });
  }

  private updateFieldTimeSpent(
    formId: string,
    fieldName: string,
    duration: number
  ): void {
    const formData = this.forms.get(formId);
    if (!formData) return;

    formData.metrics.fieldTimeSpent[fieldName] =
      (formData.metrics.fieldTimeSpent[fieldName] || 0) + duration;
  }

  private generateFormsSummary(formsData: FormData[]): any {
    return {
      totalForms: formsData.length,
      completedForms: formsData.filter((f) => f.metrics.successfulSubmission)
        .length,
      averageCompletionTime: this.calculateAverageCompletionTime(formsData),
      totalErrors: formsData.reduce((sum, f) => sum + f.metrics.errorCount, 0),
      mostCommonErrors: this.findMostCommonErrors(formsData),
      abandonmentRate: this.calculateAbandonmentRate(formsData),
    };
  }

  private calculateAverageCompletionTime(formsData: FormData[]): number {
    const completedForms = formsData.filter((f) => f.metrics.totalTime);
    if (completedForms.length === 0) return 0;

    const totalTime = completedForms.reduce(
      (sum, f) => sum + (f.metrics.totalTime || 0),
      0
    );
    return Math.round(totalTime / completedForms.length);
  }

  private findMostCommonErrors(
    formsData: FormData[]
  ): Array<{ field: string; count: number }> {
    const errorCounts = new Map<string, number>();

    formsData.forEach((form) => {
      form.interactions
        .filter((i) => i.type === 'error')
        .forEach((error) => {
          const count = errorCounts.get(error.fieldName) || 0;
          errorCounts.set(error.fieldName, count + 1);
        });
    });

    return Array.from(errorCounts.entries())
      .map(([field, count]) => ({ field, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private calculateAbandonmentRate(formsData: FormData[]): number {
    const startedForms = formsData.filter(
      (f) => f.metrics.interactionCount > 0
    );
    if (startedForms.length === 0) return 0;

    const abandonedForms = startedForms.filter(
      (f) => !f.metrics.successfulSubmission
    );
    return Math.round((abandonedForms.length / startedForms.length) * 100);
  }

  private removeFormListeners(): void {
    document.removeEventListener('submit', this.handleFormSubmit);
    document.removeEventListener('focus', this.handleFieldFocus, true);
    document.removeEventListener('blur', this.handleFieldBlur, true);
    document.removeEventListener('input', this.handleFieldInput);
    document.removeEventListener('invalid', this.handleFieldError);
  }
}
