/**
 * How long a deteriorating patient may wait for an answer, and who is chased
 * when nobody gives one.
 *
 * RCP guidance for NEWS2 expects a clinical response at the bedside within
 * 15-30 minutes for the emergency band. Acknowledgement has to be quicker than
 * that to leave any time to act, so the doctor has ten minutes to say they have
 * seen it. The urgent band is a review rather than an emergency, so half an
 * hour.
 *
 * These are the numbers to change if the hospital's own policy differs — they
 * are deliberately in one place rather than scattered through the actions.
 */

export const ACK_MINUTES: Record<string, number> = {
    emergency: 10,
    urgent: 30,
};

/**
 * What happens when the clock runs out.
 *
 * Level 1 re-alerts the same doctor: the commonest reason for silence is a
 * missed notification, not a refusal. Level 2 widens to the people who can find
 * another doctor, because at that point the problem is no longer clinical but
 * organisational — nobody is coming.
 *
 * There is no on-call roster in the system, so level 2 is IPD managers and
 * admins. A real chain needs a duty roster; that is a larger piece of work and
 * this is structured so it can slot in as a level between the two.
 */
export const CHASE_MINUTES: Record<string, number> = {
    emergency: 5,
    urgent: 15,
};

export const MAX_ESCALATION_LEVEL = 2;

export function ackDeadline(band: string, from: Date = new Date()): Date {
    const minutes = ACK_MINUTES[band] ?? ACK_MINUTES.urgent;
    return new Date(from.getTime() + minutes * 60_000);
}

export function nextChaseAt(band: string, from: Date = new Date()): Date {
    const minutes = CHASE_MINUTES[band] ?? CHASE_MINUTES.urgent;
    return new Date(from.getTime() + minutes * 60_000);
}

/** One nursing task per non-empty line of the doctor's instructions. */
export function parseInstructions(text: string): string[] {
    return String(text || '')
        .split(/\r?\n/)
        .map((l) => l.replace(/^\s*[-*\d.)]+\s*/, '').trim())
        .filter((l) => l.length > 1)
        .slice(0, 20);
}
