export type LogicCombinator = "and" | "or";
export type LogicOperator = ">=" | "<=" | ">" | "<" | "==" | "!=" | "in";

export interface VisualCondition {
  id: string;
  variable: string;
  operator: LogicOperator;
  value: string;
}

export interface VisualRuleModel {
  combinator: LogicCombinator;
  conditions: VisualCondition[];
}

export const DERIVED_VARIABLE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "derived.age", label: "derived.age (Patient Age in Years)" },
  { value: "derived.bmi", label: "derived.bmi (Body Mass Index)" },
  { value: "patient.sex_at_birth", label: "patient.sex_at_birth (Female / Male)" },
  { value: "derived.fib4_score", label: "derived.fib4_score (FIB-4 Hepatic Fibrosis)" },
  { value: "derived.apri_score", label: "derived.apri_score (APRI Score)" },
  { value: "derived.nfs_score", label: "derived.nfs_score (NAFLD Fibrosis Score)" },
  { value: "derived.tyrer_cuzick_lifetime_risk", label: "derived.tyrer_cuzick_lifetime_risk (%)" },
  { value: "derived.canrisk_lifetime_risk", label: "derived.canrisk_lifetime_risk (%)" },
  { value: "derived.gail_5yr_risk", label: "derived.gail_5yr_risk (%)" },
  { value: "derived.premm5_score", label: "derived.premm5_score (%)" },
  { value: "derived.plcom2012_6yr_risk", label: "derived.plcom2012_6yr_risk (%)" },
  { value: "derived.aha_prevent_10yr_risk", label: "derived.aha_prevent_10yr_risk (%)" },
  { value: "derived.cha2ds2_vasc_score", label: "derived.cha2ds2_vasc_score" },
  { value: "derived.has_bled_score", label: "derived.has_bled_score" },
  { value: "derived.stop_bang_score", label: "derived.stop_bang_score" },
  { value: "derived.abcd2_score", label: "derived.abcd2_score" },
  { value: "derived.add_rs_score", label: "derived.add_rs_score" },
  { value: "derived.wells_dvt_pe_score", label: "derived.wells_dvt_pe_score" },
  { value: "derived.geneva_pe_score", label: "derived.geneva_pe_score" },
  { value: "derived.roma_score", label: "derived.roma_score (%)" },
  { value: "derived.rotterdam_criteria_count", label: "derived.rotterdam_criteria_count" },
  { value: "derived.frax_major_risk", label: "derived.frax_major_risk (%)" },
  { value: "derived.osta_score", label: "derived.osta_score" },
  { value: "derived.ipss_score", label: "derived.ipss_score" },
  { value: "derived.shim_score", label: "derived.shim_score" },
  { value: "derived.pfdi20_score", label: "derived.pfdi20_score" },
  { value: "derived.hit6_score", label: "derived.hit6_score" },
  { value: "derived.isth_bat_score", label: "derived.isth_bat_score" },
  { value: "derived.mesa_cac_score", label: "derived.mesa_cac_score (%)" },
];

const SUPPORTED_OPS = new Set<LogicOperator>([">=", "<=", ">", "<", "==", "!=", "in"]);

function stringifyConditionValue(val: unknown): string {
  if (Array.isArray(val)) return val.map(String).join(", ");
  if (typeof val === "boolean") return val ? "true" : "false";
  if (val === null || val === undefined) return "";
  return String(val);
}

function parseConditionValue(raw: string, operator: LogicOperator): unknown {
  const trimmed = raw.trim();
  if (operator === "in") {
    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        if (item === "true") return true;
        if (item === "false") return false;
        const asNum = Number(item);
        return Number.isFinite(asNum) && item !== "" ? asNum : item;
      });
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed !== "" && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  return trimmed;
}

function parseLeafCondition(node: unknown, idx: number): VisualCondition | null {
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;
  const entries = Object.entries(node as Record<string, unknown>);
  if (entries.length !== 1) return null;
  const [op, args] = entries[0]!;
  if (!SUPPORTED_OPS.has(op as LogicOperator) || !Array.isArray(args) || args.length !== 2) {
    return null;
  }

  const left = args[0];
  if (!left || typeof left !== "object" || Array.isArray(left) || typeof (left as { var?: unknown }).var !== "string") {
    return null;
  }

  return {
    id: `cond-${idx}-${Math.random().toString(36).slice(2, 7)}`,
    variable: (left as { var: string }).var,
    operator: op as LogicOperator,
    value: stringifyConditionValue(args[1]),
  };
}

/**
 * Attempts to parse a JsonLogic expression into flat visual rows.
 * Returns null for deeply nested compound trees so the user can edit them safely in Raw JSON mode.
 */
export function parseToVisualModel(expr: Record<string, unknown>): VisualRuleModel | null {
  const entries = Object.entries(expr);
  if (entries.length !== 1) return null;
  const [rootOp, payload] = entries[0]!;

  if ((rootOp === "and" || rootOp === "or") && Array.isArray(payload)) {
    const conditions: VisualCondition[] = [];
    for (let i = 0; i < payload.length; i++) {
      const leaf = parseLeafCondition(payload[i], i);
      if (!leaf) return null;
      conditions.push(leaf);
    }
    return { combinator: rootOp, conditions };
  }

  const singleLeaf = parseLeafCondition(expr, 0);
  if (singleLeaf) {
    return { combinator: "and", conditions: [singleLeaf] };
  }

  return null;
}

/**
 * Serializes a flat visual condition model back into a valid JsonLogic object.
 */
export function serializeVisualModel(model: VisualRuleModel): Record<string, unknown> {
  const clauses = model.conditions.map((c) => ({
    [c.operator]: [{ var: c.variable }, parseConditionValue(c.value, c.operator)],
  }));

  if (clauses.length === 1) {
    return clauses[0]!;
  }
  return { [model.combinator]: clauses };
}

export interface SyntheticPreset {
  id: string;
  label: string;
  dob: string;
  sex_at_birth: "Female" | "Male";
  answers: Record<string, unknown>;
}

export const SYNTHETIC_DRY_RUN_PRESETS: readonly SyntheticPreset[] = [
  {
    id: "lung-smoker",
    label: "Synthetic 66yo Male Smoker (USPSTF Lung / AAA)",
    dob: "1960-01-15",
    sex_at_birth: "Male",
    answers: {
      smoking_status: "current",
      pack_years: 30,
      copd_history: true,
      height_cm: 178,
      weight_kg: 80,
    },
  },
  {
    id: "breast-pedigree",
    label: "Synthetic 42yo Female High-Risk Pedigree (Tyrer-Cuzick)",
    dob: "1984-05-01",
    sex_at_birth: "Female",
    answers: {
      ethnicity_ancestry: "ashkenazi_jewish",
      has_personal_breast_cancer: false,
      first_degree_breast_cancer_count: 2,
      first_degree_ovarian_cancer_count: 1,
      youngest_family_breast_cancer_age: 44,
      breast_density_birads: "D",
      has_atypical_hyperplasia_or_lcis: true,
    },
  },
  {
    id: "acute-snnoop10",
    label: "Synthetic 58yo Acute Thunderclap Headache (SNNOOP10)",
    dob: "1968-03-20",
    sex_at_birth: "Female",
    answers: {
      has_thunderclap_headache: true,
      has_headaches: true,
      hit6_total_score: 68,
    },
  },
  {
    id: "hepatology-fib4",
    label: "Synthetic 62yo Elevated Liver Labs (FIB-4 / APRI / NFS)",
    dob: "1964-01-01",
    sex_at_birth: "Male",
    answers: {
      height_cm: 170,
      weight_kg: 96,
      has_diabetes: true,
      lab_ast_u_l: 95,
      lab_alt_u_l: 52,
      lab_platelets_10e9_l: 115,
      lab_albumin_g_dl: 3.2,
    },
  },
  {
    id: "healthy-baseline",
    label: "Synthetic 32yo Healthy Baseline (Zero Triggers)",
    dob: "1994-03-10",
    sex_at_birth: "Female",
    answers: {
      height_cm: 165,
      weight_kg: 60,
      smoking_status: "never",
      has_personal_breast_cancer: false,
    },
  },
];
