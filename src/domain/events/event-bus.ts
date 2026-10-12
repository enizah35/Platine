// Bus d'événements du domaine, en mémoire et synchrone (plan §5.3).
import type { DomainEvent, DomainEventOf, DomainEventType } from '../contracts/events.js';

export type Unsubscribe = () => void;
export type EventListener<E extends DomainEvent = DomainEvent> = (e: E) => void;

/**
 * - `emit` appelle les abonnés dans l'ordre d'abonnement. Une exception d'un abonné ne bloque ni
 *   l'émetteur ni les autres abonnés : elle est transmise à `onListenerError` (défaut : console.error).
 * - `on(listener)` reçoit tout ; `on(type, listener)` ou `on([types], listener)` filtre avec un typage discriminé.
 */
export class EventBus {
  private readonly listeners = new Set<{ types: ReadonlySet<DomainEventType> | null; fn: EventListener }>();

  constructor(
    // Défaut : on journalise sans faire tomber le bot. La composition root passe le logger pino.
    private readonly onListenerError: (error: unknown, event: DomainEvent) => void = (error, event) => {
      console.error(`EventBus : un abonné à ${event.type} a levé une erreur`, error);
    },
  ) {}

  emit(event: DomainEvent): void {
    for (const l of [...this.listeners]) {
      if (l.types !== null && !l.types.has(event.type)) continue;
      try {
        l.fn(event);
      } catch (error) {
        this.onListenerError(error, event);
      }
    }
  }

  on(listener: EventListener): Unsubscribe;
  on<T extends DomainEventType>(
    type: T | readonly T[],
    listener: EventListener<DomainEventOf<T>>,
  ): Unsubscribe;
  on(
    typeOrListener: DomainEventType | readonly DomainEventType[] | EventListener,
    maybeListener?: EventListener<never>,
  ): Unsubscribe {
    let entry: { types: ReadonlySet<DomainEventType> | null; fn: EventListener };
    if (typeof typeOrListener === 'function') {
      entry = { types: null, fn: typeOrListener };
    } else {
      if (!maybeListener) throw new TypeError('EventBus.on : abonné manquant');
      const types = typeof typeOrListener === 'string' ? [typeOrListener] : typeOrListener;
      entry = { types: new Set(types), fn: maybeListener as EventListener };
    }
    this.listeners.add(entry);
    return () => {
      this.listeners.delete(entry);
    };
  }

  /** Nombre d'abonnés (utile aux tests et au diagnostic). */
  get listenerCount(): number {
    return this.listeners.size;
  }
}
