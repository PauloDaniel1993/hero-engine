/**
 * Hero Engine — public plugin contract.
 *
 * A mechanic (a weapon's or character's bespoke ruleset) is a `MechanicPlugin`:
 * a mostly-declarative description of trackers, resources, derived formulas,
 * triggers, actions, stances, transformations, consequence tables and GM
 * adjudications — plus optional code hooks for logic the declarations can't
 * express. Every numeric knob should be surfaced through `configSchema` so the
 * GM can retune it without code.
 *
 * This file is self-contained (no Foundry imports) and is published as the
 * module's `.d.ts` for external plugin authors.
 */
/** Foundry documents are opaque to the contract. */
export type ActorDoc = unknown;
export type ItemDoc = unknown;
export type Archetype = "character" | "item";
/**
 * A literal number, or a formula string evaluated with mechanic variables and
 * actor roll data — e.g. `"12 + @pi"`, `"1 + floor(@pi / 10)"`, `"@prof + 8"`.
 * Formulas containing dice (e.g. `"2d8 + 4"`) are rolled via Foundry's Roll.
 */
export type NumberOrFormula = number | string;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | {
    [key: string]: JsonValue;
};
export type RecordFieldType = "string" | "number" | "boolean" | "choice" | "json";
export interface RecordFieldSchema {
    key: string;
    type: RecordFieldType;
    labelKey: string;
    required?: boolean;
    choices?: string[];
    min?: number;
    max?: number;
}
export interface RecordLifecyclePolicy {
    type: "permanent" | "world-time" | "combat-time" | "transform" | "manual";
    /** Formula in seconds for world-time or turns for combat-time. */
    duration?: NumberOrFormula;
}
export interface RecordActionDef {
    id: string;
    labelKey: string;
    gmOnly?: boolean;
    ownerOnly?: boolean;
    destructive?: boolean;
}
/** A reusable slotted collection of structured records owned by one mechanic instance. */
export interface RecordCollectionDef {
    id: string;
    labelKey: string;
    descriptionKey?: string;
    schemaVersion: number;
    capacity: NumberOrFormula;
    visibility?: "public" | "owner" | "gm";
    fields: RecordFieldSchema[];
    actions?: RecordActionDef[];
    lifecycle?: RecordLifecyclePolicy;
}
export interface MechanicRecord {
    id: string;
    schemaVersion: number;
    createdAt: number;
    createdBy: string;
    data: {
        [key: string]: JsonValue;
    };
    temporary?: boolean;
    lifecycle?: {
        type: RecordLifecyclePolicy["type"];
        worldTime?: number;
        combatUuid?: string;
        round?: number;
        turn?: number;
        combatantId?: string;
        transformActivationId?: string;
    };
}
export interface RecordSlot {
    id: string;
    record: MechanicRecord | null;
    blocked?: {
        reason: string;
        at: number;
        by: string;
    } | null;
}
export interface PendingRecordReplacement {
    id: string;
    record: MechanicRecord;
    createdAt: number;
    expiresAt?: number;
}
export interface RecordCollectionSnapshot {
    id: string;
    schemaVersion: number;
    capacity: number;
    slots: RecordSlot[];
    pending: PendingRecordReplacement[];
    overflow: RecordSlot[];
    recovery?: string;
}
export interface RecordCreateOptions {
    temporary?: boolean;
    lifecycle?: MechanicRecord["lifecycle"];
    pendingWhenFull?: boolean;
    idempotencyKey?: string;
}
export interface RecordAccessor {
    list(collectionId: string): RecordCollectionSnapshot;
    get(collectionId: string, recordId: string): MechanicRecord | null;
    create(collectionId: string, data: {
        [key: string]: JsonValue;
    }, options?: RecordCreateOptions): Promise<MechanicRecord>;
    update(collectionId: string, recordId: string, patch: {
        [key: string]: JsonValue;
    }, idempotencyKey?: string): Promise<MechanicRecord>;
    remove(collectionId: string, recordId: string, idempotencyKey?: string): Promise<void>;
    block(collectionId: string, slotId: string, reason: string): Promise<void>;
    unblock(collectionId: string, slotId: string): Promise<void>;
    expire(collectionId: string, recordId: string): Promise<void>;
    replacePending(collectionId: string, pendingId: string, eraseRecordId: string): Promise<MechanicRecord>;
    cancelPending(collectionId: string, pendingId: string): Promise<void>;
    runAction(collectionId: string, recordId: string, actionId: string): Promise<void>;
}
export interface SecureTargetRequest {
    kind: string;
    eventId: string;
    targetUuid: string;
    weaponUuid?: string;
    category?: string;
    opportunityId?: string;
    featureOpaqueId?: string;
    createdAt?: number;
}
/** Normalized events dispatched by the engine's trigger bus. */
export type EngineEvent = "attack-hit" | "crit-dealt" | "crit-received" | "reduced-to-zero" | "damage-taken" | "ally-downed" | "rest-short" | "rest-long" | "turn-start" | "turn-end" | "combat-round" | "world-time-advanced";
/** A step on a tracker's ladder (e.g. Peso da Tempestade 1–6, Marcas de Fome 3/5/7/10). */
export interface ThresholdDef {
    /** Tracker value at which this threshold becomes active (value >= at). */
    at: number;
    labelKey: string;
    descriptionKey?: string;
}
/** A bounded numeric tracker (PI, Peso, Marcas, Lendas Gravadas...). */
export interface TrackerDef {
    id: string;
    labelKey: string;
    min?: NumberOrFormula;
    max?: NumberOrFormula;
    initial?: NumberOrFormula;
    /** Granularity of manual +/- adjustments. Default 1. */
    step?: number;
    thresholds?: ThresholdDef[];
}
/** "full" refills to max; "none" does nothing; a string is a dice/formula amount to add. */
export type RechargeAmount = "full" | "none" | string;
export interface RechargeRule {
    on: "longRest" | "shortRest" | "dawn" | "manual";
    /** Applied when the rule fires (and `conditionKey`, if set, is confirmed). */
    amount?: RechargeAmount;
    /** Hard-set the pool instead of adding (e.g. Storm Charges reset to 0 on long rest). */
    setTo?: number;
    /** i18n key of a yes/no question the GM confirms before `amount` applies ("under open sky?"). */
    conditionKey?: string;
    /** Resolve the condition from a persisted mechanic flag without a GM prompt. */
    conditionFlag?: string;
    /** Applied instead when the GM answers "no" (e.g. `"2d8 + 4"`). */
    fallbackAmount?: RechargeAmount;
}
/** A spendable pool (Book charges, Storm Charges, Cargas Primordiais...). */
export interface ResourceDef {
    id: string;
    labelKey: string;
    max: NumberOrFormula;
    initial?: NumberOrFormula;
    recharge?: RechargeRule[];
}
/** A named formula exposed to all other formulas as `@id` (e.g. bookLevel). */
export interface DerivedDef {
    id: string;
    labelKey?: string;
    formula: string;
}
/** A declarative state mutation. */
export interface StateOp {
    op: "adjust" | "set";
    /** A tracker/resource id, or `"flag:<name>"` for named state flags. */
    target: string;
    /** For `adjust`: signed amount (formula allowed). */
    amount?: NumberOrFormula;
    /** For `set`. */
    value?: unknown;
}
export interface PromptOutcome {
    apply?: StateOp[];
    /** Activate this transformation. */
    transform?: string;
    /** i18n key posted to chat describing the outcome. */
    chatKey?: string;
    /** Invoke `hooks.onPromptResolved`. */
    runHook?: boolean;
}
export interface SavePromptDef {
    /** dnd5e ability keys the player may choose between, e.g. `["wis", "cha"]`. */
    abilities: string[];
    dcFormula: string;
    onSuccess?: PromptOutcome;
    onFailure?: PromptOutcome;
    nat20AutoSuccess?: boolean;
    nat1AutoFailure?: boolean;
}
/** A dialog opened for a user: a save, a choice, or a confirmation. */
export interface PromptDef {
    id: string;
    titleKey: string;
    bodyKey?: string;
    save?: SavePromptDef;
    choices?: {
        id: string;
        labelKey: string;
        apply?: StateOp[];
        chatKey?: string;
    }[];
    /** If true the user may dismiss without resolving (e.g. "attempt the Ultimate?"). */
    optional?: boolean;
}
/** Binds an engine event to declarative responses and/or the plugin hook. */
export interface TriggerDef {
    id: string;
    labelKey: string;
    /** `"manual"` triggers only fire from the sheet-panel button. */
    event: EngineEvent | "manual";
    apply?: StateOp[];
    /** PromptDef id opened for the owner when the trigger fires. */
    prompt?: string;
    /** i18n key: GM must confirm before `apply` runs. */
    gmConfirmKey?: string;
    runHook?: boolean;
    /**
     * Expose a manual button on the sheet panel replaying this trigger, so play
     * never blocks on missed automation. Default true.
     */
    manualFallback?: boolean;
}
export interface CooldownDef {
    type: "interval" | "longRest" | "shortRest" | "dawn";
    /** For `interval`: hours of world time (formula allowed, e.g. `24 * 7`). */
    hours?: NumberOrFormula;
}
/** A button the owner (or GM) activates: costs, rolls, transforms, adjudications. */
export interface ActionDef {
    id: string;
    labelKey: string;
    descriptionKey?: string;
    gmOnly?: boolean;
    costs?: {
        resource: string;
        amount: NumberOrFormula;
    }[];
    apply?: StateOp[];
    /** State flag that must be truthy / falsy for the action to be available. */
    requiresFlag?: string;
    forbidsFlag?: string;
    cooldown?: CooldownDef;
    roll?: {
        formula: string;
        flavorKey?: string;
    };
    /** PromptDef id opened as part of the action (choice or save). */
    prompt?: string;
    transform?: string;
    /** AdjudicationDef id queued for the GM. */
    adjudicate?: string;
    /** ConsequenceTableDef id rolled when the action resolves. */
    table?: string;
    runHook?: boolean;
    /**
     * Post the engine's generic "used {action}" chat card after resolution.
     * Defaults to true. Deferred workflows that only submit a GM ruling should
     * disable this and post their completion message when the ruling resolves.
     */
    announceUse?: boolean;
}
export interface StanceDef {
    id: string;
    labelKey: string;
    descriptionKey?: string;
    /** ActiveEffect source data applied while the stance is active. */
    effects?: Record<string, unknown>[];
}
/** Mutually exclusive modes (Posturas, climate modes). */
export interface StanceGroupDef {
    id: string;
    labelKey: string;
    switchOn: "turn-start" | "any";
    switchCost?: {
        resource: string;
        amount: NumberOrFormula;
    };
    allowNone?: boolean;
    stances: StanceDef[];
}
export interface TransformExpireDef {
    apply?: StateOp[];
    adjudicate?: string;
    table?: string;
    chatKey?: string;
    runHook?: boolean;
    /** Also settle the expiry outcome when the form is ended manually. */
    onManual?: boolean;
}
/** A timed full-body form (Ultimates, Avatar states). */
export interface TransformDef {
    id: string;
    labelKey: string;
    /**
     * "overlay": Active Effects + granted items on the same actor.
     * "actor-swap": polymorph-style swap into a prepared form Actor.
     * "config": read strategy from the config field `transform.<id>.strategy`.
     */
    strategy: "overlay" | "actor-swap" | "config";
    durationRounds: NumberOrFormula;
    overlay?: {
        effects: Record<string, unknown>[];
        grantItems?: Record<string, unknown>[];
    };
    swap?: {
        formActorName: string;
        hpCarry: "keep-percent" | "form-max";
    };
    onExpire?: TransformExpireDef;
}
/** A rollable price/consequence table (d6 Preço do Poder, d4 Preço Épico). */
export interface ConsequenceTableDef {
    id: string;
    labelKey: string;
    /** e.g. "1d6" */
    die: string;
    entries: {
        min: number;
        max: number;
        textKey: string;
        apply?: StateOp[];
    }[];
}
/** A judgment call routed to the GM (valid sacrifice? oath progress?). */
export interface AdjudicationDef {
    id: string;
    titleKey: string;
    descriptionKey?: string;
    kind: "confirm" | "choice";
    /** For `choice`. */
    choices?: {
        id: string;
        labelKey: string;
        apply?: StateOp[];
    }[];
    /** For `confirm`. */
    onConfirm?: StateOp[];
    onDeny?: StateOp[];
    runHook?: boolean;
}
export type ConfigFieldType = "number" | "boolean" | "choice" | "string" | "formula" | "dice";
/** One GM-tunable knob; drives the auto-generated config form. */
export interface ConfigFieldDef {
    key: string;
    type: ConfigFieldType;
    labelKey: string;
    hintKey?: string;
    default: unknown;
    /** Grouping header (i18n key) in the generated form. */
    groupKey?: string;
    /** For `choice`: value -> labelKey. */
    choices?: Record<string, string>;
    min?: number;
    max?: number;
    step?: number;
}
/** Result of a resolved prompt. */
export interface PromptResult {
    promptId: string;
    dismissed?: boolean;
    /** For saves. */
    success?: boolean;
    total?: number;
    natural?: number;
    ability?: string;
    /** For choices. */
    choiceId?: string;
}
export interface TriggerPayload {
    event: EngineEvent | "manual";
    /** Extra event data (e.g. the downed ally, the damage amount). */
    data?: Record<string, unknown>;
}
/** Read/write access to one mechanic instance's persisted state. */
export interface StateAccessor {
    /** Current value of a tracker or resource. */
    get(id: string): number;
    set(id: string, value: number): Promise<number>;
    /** Clamped adjustment; returns the new value. */
    adjust(id: string, delta: number): Promise<number>;
    getFlag<T = unknown>(name: string): T | undefined;
    setFlag(name: string, value: unknown): Promise<void>;
    activeStance(groupId: string): string | null;
    /** Active transformation, if any. */
    transform(): {
        id: string;
        roundsLeft: number;
    } | null;
}
/**
 * Everything a plugin hook needs to act on one attached mechanic instance.
 * All engine services flow through this — plugins never touch engine internals.
 */
export interface MechanicContext {
    /** Actor currently executing the mechanic; may be a temporary dnd5e actor-swap form. */
    actor: ActorDoc;
    /** Stable actor that owns character state and persistent document projections. */
    canonicalActor: ActorDoc;
    /** Bound item for `item` archetype mechanics. */
    item?: ItemDoc;
    pluginId: string;
    /** Resolved config value (instance override -> world setting -> default). */
    config<T = unknown>(key: string): T;
    state: StateAccessor;
    records: RecordAccessor;
    /** Submit an owner-authored request that an active GM revalidates using the server-attributed update user. */
    requestSecureTarget(request: SecureTargetRequest): Promise<void>;
    /** Deterministic formula evaluation with mechanic variables + actor roll data. */
    evalFormula(formula: NumberOrFormula): number;
    /** Roll dice (chat-visible) and return the total. */
    rollDice(formula: string, flavorKey?: string): Promise<number>;
    /** Open a declared prompt for the responsible user; null if dismissed. */
    openPrompt(promptId: string, extraData?: Record<string, unknown>): Promise<PromptResult | null>;
    activateTransform(transformId: string): Promise<void>;
    endTransform(): Promise<void>;
    queueAdjudication(adjudicationId: string, note?: string): Promise<void>;
    rollTable(tableId: string): Promise<{
        roll: number;
        textKey: string;
    }>;
    /** Post a localized chat message attributed to the actor. */
    postChat(key: string, data?: Record<string, unknown>): Promise<void>;
    /**
     * Post an interactive chat card whose buttons execute this mechanic's
     * declared actions (owner/GM gated, idempotent per button).
     */
    postCard(opts: {
        titleKey: string;
        bodyKey?: string;
        bodyData?: Record<string, unknown>;
        buttons: {
            labelKey: string;
            actionId: string;
        }[];
    }): Promise<void>;
    applyOps(ops: StateOp[]): Promise<void>;
    /** Replay a declared trigger (same path as automation). */
    fireTrigger(triggerId: string, payload?: TriggerPayload): Promise<void>;
}
/** Code-level escape hatch for logic the declarations can't express. */
export interface PluginRuntimeHooks {
    onAttach?(ctx: MechanicContext): void | Promise<void>;
    onDetach?(ctx: MechanicContext): void | Promise<void>;
    onTrigger?(ctx: MechanicContext, trigger: TriggerDef, payload: TriggerPayload): void | Promise<void>;
    onActionUse?(ctx: MechanicContext, action: ActionDef, promptResult?: PromptResult | null): void | Promise<void>;
    onPromptResolved?(ctx: MechanicContext, prompt: PromptDef, result: PromptResult): void | Promise<void>;
    onThreshold?(ctx: MechanicContext, tracker: TrackerDef, threshold: ThresholdDef, direction: "up" | "down"): void | Promise<void>;
    onTransformExpire?(ctx: MechanicContext, transform: TransformDef): void | Promise<void>;
    onAdjudicated?(ctx: MechanicContext, adjudication: AdjudicationDef, resultId: string): void | Promise<void>;
    onRecharge?(ctx: MechanicContext, resource: ResourceDef, rule: RechargeRule, applied: number): void | Promise<void>;
    onRecordAction?(ctx: MechanicContext, collection: RecordCollectionDef, record: MechanicRecord, action: RecordActionDef): void | Promise<void>;
    onRecordReplacement?(ctx: MechanicContext, collection: RecordCollectionDef, pending: MechanicRecord, erased: MechanicRecord): void | Promise<void>;
    /** Idempotently reconcile Items, Activities, or other projections after stored records are ready. */
    onRecordsReady?(ctx: MechanicContext): void | Promise<void>;
    migrateRecord?(collectionId: string, record: MechanicRecord, fromVersion: number, toVersion: number): MechanicRecord;
    onSecureTargetRequest?(ctx: MechanicContext, request: SecureTargetRequest, target: ActorDoc, trustedUserId: string): void | Promise<void>;
}
export interface MechanicPlugin {
    /** Unique kebab-case id, e.g. "presa-tempestade". */
    id: string;
    /** Plugin semver (informational; shown in the GM panel). */
    version: string;
    archetype: Archetype;
    nameKey: string;
    descriptionKey?: string;
    /** Inline i18n bundles: locale -> nested key object. English recommended as fallback. */
    i18n?: Record<string, Record<string, unknown>>;
    trackers?: TrackerDef[];
    resources?: ResourceDef[];
    derived?: DerivedDef[];
    prompts?: PromptDef[];
    triggers?: TriggerDef[];
    actions?: ActionDef[];
    stances?: StanceGroupDef[];
    transformations?: TransformDef[];
    tables?: ConsequenceTableDef[];
    adjudications?: AdjudicationDef[];
    recordCollections?: RecordCollectionDef[];
    configSchema?: ConfigFieldDef[];
    hooks?: PluginRuntimeHooks;
}
/** The API exposed at `game.modules.get("hero-engine").api` and via the registration hook. */
export interface HeroEngineAPI {
    /** Register a mechanic. Throws (with field-path messages) on invalid definitions or duplicate ids. */
    register(plugin: MechanicPlugin): void;
    get(pluginId: string): MechanicPlugin | undefined;
    list(): MechanicPlugin[];
    /** Attach a mechanic to an actor; `item` binds an `item`-archetype mechanic to a specific Item. */
    attach(actor: ActorDoc, pluginId: string, options?: {
        item?: ItemDoc;
    }): Promise<void>;
    detach(actor: ActorDoc, pluginId: string): Promise<void>;
    /** Context for an attached instance, or null if not attached. */
    contextFor(actor: ActorDoc, pluginId: string): MechanicContext | null;
    /** Stable macro helper: open the standalone Mechanics window for an actor. */
    openMechanics(actor: ActorDoc): unknown;
    /** Stable macro helper: run one declared action without importing engine internals. */
    runAction(actor: ActorDoc, pluginId: string, actionId: string): Promise<void>;
    /** Preview or execute the built-in Thar’gunn managed-content reconciliation. */
    previewThargunnInstall(options?: {
        baseActorId?: string;
        ultimateActorId?: string;
    }): Promise<unknown>;
    installThargunn(options?: {
        baseActorId?: string;
        ultimateActorId?: string;
        dryRun?: boolean;
    }): Promise<unknown>;
    /** Version of the engine contract, for plugin compatibility checks. */
    readonly apiVersion: string;
}
