import i18next from "i18next";

/**
 * Minutes, said the way a person would say them.
 *
 * "110 min" is arithmetic homework. byge's whole claim is that you get the
 * answer without working anything out, and a reader who has to divide by sixty
 * to know whether that is soon has been handed the same job as reading a radar
 * map — which is the thing this app exists to avoid.
 *
 * Two registers, because the two places have different room:
 *
 *   long   the headline and its notes. "1 hour and 50 min".
 *   short  the list row and anything else set on one line. "1h50m".
 *
 * The joiner is its own key, not a hardcoded " and ": Norwegian uses "og", and
 * languages differ on whether the unit repeats. Hours are pluralised through
 * i18next rather than a ternary, for the same reason as everywhere else — two
 * forms is an English assumption.
 */

const MINUTES_PER_HOUR = 60;

export function durationLong(min: number): string {
  const total = Math.max(0, Math.round(min));
  const hours = Math.floor(total / MINUTES_PER_HOUR);
  const mins = total % MINUTES_PER_HOUR;

  if (hours === 0) return i18next.t("duration.mins", { count: mins });
  // Exactly on the hour says so, rather than "1 hour and 0 min".
  if (mins === 0) return i18next.t("duration.hours", { count: hours });
  return i18next.t("duration.hoursMins", {
    hours: i18next.t("duration.hours", { count: hours }),
    mins: i18next.t("duration.mins", { count: mins }),
  });
}

export function durationShort(min: number): string {
  const total = Math.max(0, Math.round(min));
  const hours = Math.floor(total / MINUTES_PER_HOUR);
  const mins = total % MINUTES_PER_HOUR;

  if (hours === 0) return i18next.t("duration.shortMins", { count: mins });
  if (mins === 0) return i18next.t("duration.shortHours", { count: hours });
  return i18next.t("duration.shortHoursMins", { hours, mins });
}
