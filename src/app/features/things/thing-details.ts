import {
  Component,
  computed,
  effect,
  inject,
  Injector,
  afterNextRender,
  linkedSignal,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { Schema, Pin, Value } from '../../../../shared/model';
import { RegistryStore } from '../../core/state/registry.store';
import { ThingsStore } from '../../core/state/things.store';
import { ErrorMessage } from '../../components/error-message/error-message';
import { FieldEditor } from '../../components/field/field';
import { ScrollContainer } from '../../components/scroll-container/scroll-container';
import { TopBar } from '../../components/top-bar/top-bar';
import { fieldAnchor, fieldSections, samePin } from '../../utils/sections.util';
import { activeImport } from './thing.view';
import { routeThing } from './thing-loader';
import { RowSkeleton } from './row-skeleton';

/** Every field of a Thing with its editors, section management and custom fields. */
@Component({
  selector: 'bt-thing-details',
  imports: [
    FormsModule,
    RouterLink,
    ErrorMessage,
    FieldEditor,
    RowSkeleton,
    ScrollContainer,
    TopBar,
  ],
  templateUrl: './thing-details.html',
  styleUrl: './thing-details.scss',
})
export class ThingDetailsPage {
  private things = inject(ThingsStore);
  private registry = inject(RegistryStore);
  private route = inject(ActivatedRoute);
  private injector = inject(Injector);
  private current = routeThing();

  readonly id = this.current.id;
  readonly thing = this.current.thing;
  readonly detail = this.current.detail;
  readonly loaded = this.current.loaded;
  readonly missing = this.current.missing;
  readonly error = this.current.error;
  readonly processing = computed(() => activeImport(this.detail()?.import));
  readonly sections = computed(() => fieldSections(this.detail()?.fieldSets ?? []));
  readonly fieldAnchor = fieldAnchor;
  readonly name = linkedSignal(() => this.thing()?.name ?? '');
  readonly description = linkedSignal(() => this.thing()?.description ?? '');
  readonly selectedSet = signal('');
  readonly newField = signal('');
  readonly localLabel = signal('');
  readonly localValue = signal('');
  readonly localSensitive = signal(false);

  readonly availableSets = computed(() =>
    this.registry
      .fieldSets()
      .filter(
        (set) =>
          set.categoryId === this.thing()?.categoryId &&
          !this.detail()?.fieldSets.some((selected) => selected.id === set.id),
      ),
  );

  readonly fields = this.registry.fields;

  readonly standaloneDefinition = computed<Schema['Field'] | null>(() => {
    const field = this.fields().find((f) => f.id === this.newField());

    return field ? { ...field, value: null, masked: false, origin: null, sourceRefs: [] } : null;
  });

  private localCache = new WeakMap<Schema['UndefinedField'], Schema['Field']>();

  constructor() {
    void this.registry.ensureLoaded();

    let scrolled = false;

    // Scrolls to a linked field once its section has rendered.
    effect(() => {
      if (!this.detail() || scrolled) return;
      scrolled = true;
      afterNextRender(
        () => {
          const fragment = this.route.snapshot.fragment;

          if (fragment) document.getElementById(fragment)?.scrollIntoView({ block: 'center' });
        },
        { injector: this.injector },
      );
    });
  }

  retry() {
    this.current.retry();
  }

  update(patch: Schema['ThingPatch']) {
    void this.things.update(this.id(), patch);
  }

  saveBasics() {
    if (!this.name().trim()) return;
    this.update({ name: this.name(), description: this.description() });
  }

  addSet() {
    if (this.selectedSet()) this.update({ addFieldSetIds: [this.selectedSet()] });
    this.selectedSet.set('');
  }

  requiredSet(id: string) {
    return this.detail()?.fieldSets.some((set) => set.includes.includes(id)) ?? false;
  }

  pinned(pin: Pin) {
    return this.detail()?.pinnedFields.some((p) => samePin(p, pin)) ?? false;
  }

  pin(pin: Pin) {
    const pins = this.detail()?.pinnedFields ?? [];

    this.update({
      pinnedFields: this.pinned(pin) ? pins.filter((p) => !samePin(p, pin)) : [...pins, pin],
    });
  }

  fieldValue(field: Schema['Field'], setId: string | null, value: Value | null) {
    this.update({ values: [{ fieldSetId: setId, fieldId: field.id, value }] });
    this.newField.set('');
  }

  localField(field: Schema['UndefinedField']): Schema['Field'] {
    const cached = this.localCache.get(field);

    if (cached) return cached;

    const result: Schema['Field'] = {
      id: field.id,
      name: field.label,
      description: '',
      keywords: [],
      schema: {
        type:
          field.valueType === 'MONEY'
            ? 'object'
            : (field.valueType.toLowerCase() as Schema['SchemaTypeEnum']),
      },
      uiHint: field.valueType === 'MONEY' ? 'MONEY' : 'TEXT',
      sensitive: field.sensitive,
      value: field.value,
      masked: field.masked,
      origin: field.origin,
      sourceRefs: field.sourceRefs,
    };

    this.localCache.set(field, result);
    return result;
  }

  localChange(field: Schema['UndefinedField'], value: Value | null) {
    if (value === null) this.update({ removeUndefinedFieldIds: [field.id] });
    else
      this.update({
        undefinedFields: [{ id: field.id, label: field.label, sensitive: field.sensitive, value }],
      });
  }

  addLocal() {
    const label = this.localLabel().trim();

    if (!label) return;
    this.update({
      undefinedFields: [{ label, value: this.localValue(), sensitive: this.localSensitive() }],
    });
    this.localLabel.set('');
    this.localValue.set('');
    this.localSensitive.set(false);
  }
}
