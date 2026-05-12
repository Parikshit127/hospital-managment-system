// Unified OPD configuration reader.
// Canonical source: module_configs row with module_key='opd' (config_json).
// Fallback: legacy OPDConfig table (kept for backward compatibility during migration).

export interface ResolvedOPDConfig {
  slot_duration: number;
  slot_start_hour: number;
  slot_end_hour: number;
  max_wait_minutes: number;
  escalation_threshold: number;
  max_patients_per_doctor: number;
}

const DEFAULTS: ResolvedOPDConfig = {
  slot_duration: 15,
  slot_start_hour: 9,
  slot_end_hour: 17,
  max_wait_minutes: 30,
  escalation_threshold: 45,
  max_patients_per_doctor: 30,
};

function toInt(v: unknown, fallback: number): number {
  const n =
    typeof v === "string" ? parseInt(v, 10) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

type PrismaLike = {
  moduleConfig: {
    findFirst: (args: {
      where: { module_key: string; organizationId?: string };
      select?: Record<string, boolean>;
    }) => Promise<{ config_json: unknown } | null>;
  };
  oPDConfig: {
    findFirst: (args: {
      where: { organizationId: string };
    }) => Promise<{
      max_wait_minutes: number | null;
      escalation_threshold: number | null;
      max_patients_per_doctor: number | null;
    } | null>;
  };
};

export async function resolveOPDConfig(
  db: PrismaLike,
  organizationId: string,
): Promise<ResolvedOPDConfig> {
  const [mod, legacy] = await Promise.all([
    db.moduleConfig.findFirst({
      where: { module_key: "opd", organizationId },
      select: { config_json: true },
    }),
    db.oPDConfig.findFirst({ where: { organizationId } }),
  ]);

  const cfg = (mod?.config_json as Record<string, unknown> | null) || {};

  return {
    slot_duration: toInt(cfg.slot_duration, DEFAULTS.slot_duration),
    slot_start_hour: toInt(cfg.slot_start_hour, DEFAULTS.slot_start_hour),
    slot_end_hour: toInt(cfg.slot_end_hour, DEFAULTS.slot_end_hour),
    max_wait_minutes: toInt(
      cfg.max_wait_minutes ?? legacy?.max_wait_minutes,
      DEFAULTS.max_wait_minutes,
    ),
    escalation_threshold: toInt(
      cfg.escalation_threshold ?? legacy?.escalation_threshold,
      DEFAULTS.escalation_threshold,
    ),
    max_patients_per_doctor: toInt(
      cfg.max_patients_per_doctor ?? legacy?.max_patients_per_doctor,
      DEFAULTS.max_patients_per_doctor,
    ),
  };
}
