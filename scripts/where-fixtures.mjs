// The two workspaces' real answers, as they came back on 15 September 2026.
//
// They are here rather than inside the test because they are the whole point of it: the
// pane reads the `pm-v1` contract from workspaces that spell it two different ways, at the
// outward end as at the inward one, and a reader written against one of them silently
// draws an empty tree against the other. Trimmed to the fields the pane reads; nothing is
// reworded, and no address or credential is carried — an answer names work, never a host.
//
//   back office : PascalCase on the feature verbs, snake_case on the strategy ones
//   castalie        : snake_case throughout, phases beside the spec rather than inside it

/** Green Acres back office — `feature_spec_get { specId: 1109 }`. */
export const backOfficeSpec = {
  success: true,
  spec: {
    Id: 1109,
    FeatureBriefId: 135,
    FeatureBriefTitle: "MMM — moteur d'allocation & application des recos",
    Title: "Split canal × pays dans le fit Meridian — priors par pays, hérités du canal sinon",
    Status: "InProgress",
    Phases: [
      { Id: 2491, DisplayOrder: 0, Title: "Split + calibrateur par cellule", Status: "Done" },
      { Id: 2492, DisplayOrder: 1, Title: "Bascule Worker1 + fit officiel", Status: "InProgress" },
    ],
  },
};

/** Green Acres back office — `feature_brief_get { briefId: 135 }`, its specs trimmed to six. */
export const backOfficeBrief = {
  success: true,
  brief: {
    Id: 135,
    Title: "MMM — moteur d'allocation & application des recos",
    Status: "InProgress",
    ObjectiveId: 178,
    ObjectiveTitle: "Le MMM arbitre les enchères entre les canaux",
    Specs: [
      { Id: 1105, Title: "MCP gel/dégel manuel d'un canal MMM (sans SQL)", Status: "Done" },
      { Id: 1107, Title: "Calibration roi_m dès 1 expérience mesurée (scale élargi)", Status: "Done" },
      { Id: 1109, Title: "Split canal × pays dans le fit Meridian", Status: "InProgress" },
      { Id: 1141, Title: "Outil MCP mmm_historical_experiment_upsert", Status: "Done" },
      { Id: 1149, Title: "Calibration MMM — consommer les expériences « spend ajouté »", Status: "Done" },
      { Id: 1151, Title: "Calibration MMM — un RCT natif doit peser assez", Status: "Done" },
    ],
  },
};

/** Green Acres back office — `strategy_get_objective_breadcrumb { objectiveId: 178 }`. */
export const backOfficeChain = {
  success: true,
  objective_id: 178,
  chain: [
    { id: 5, title: "Susciter le désir pour la marque", period_id: 3, period_name: "T2 2026" },
    { id: 9, title: "Le bas de funnel est automatisé", period_id: 1, period_name: "2026" },
    { id: 14, title: "SEA : Le Marketing Mix Modeling (MMM) fonctionne selon l'état de l'art", period_id: 3, period_name: "T2 2026" },
    { id: 178, title: "Le MMM arbitre les enchères entre les canaux", period_id: 3, period_name: "T2 2026" },
  ],
};

/**
 * Green Acres back office — `strategy_get_objective`, with the key results of objective 12
 * (`200 reprises presse`, measured) and a second one in the shape the back office answers
 * for a key result nobody has recorded a value on yet.
 */
export const backOfficeObjective = {
  success: true,
  objective: {
    id: 178,
    title: "Le MMM arbitre les enchères entre les canaux",
    period_id: 3,
    period_name: "T2 2026",
    key_results: [
      { id: 11, title: "200 reprises presse", unit: "par an", current_value: 141.0, target_value: 200.0, progress: 70.5, status: "active" },
      { id: 93, title: "Contrôles MMM vérifiés actifs dans le fit", unit: null, current_value: null, target_value: 6.0, progress: null, status: "active" },
    ],
  },
};

/** Castalie — `feature_spec_get { id: 54 }`: phases beside the spec, everything snake_case. */
export const castalieSpec = {
  success: true,
  spec: {
    id: 54,
    feature_brief_id: 61,
    title: "Le panneau à droite du plein écran montre l'arbre stratégique de ce que cette copie a en main",
    status: "InProgress",
    priority: "P2",
  },
  phases: [
    { id: 268, feature_spec_id: 54, title: "Le socle : un mod typé, chargé par Claude Code, vérifié en CI", status: "InProgress", display_order: 0 },
    { id: 269, feature_spec_id: 54, title: "Le panneau : l'arbre de ce que la copie a en main", status: "NotStarted", display_order: 1 },
    { id: 270, feature_spec_id: 54, title: "Les résultats clés et les phases", status: "NotStarted", display_order: 2 },
  ],
  risks: [],
  acceptance_tests: [],
};

/** Castalie — `feature_brief_get { id: 61 }`: a brief that serves no objective. */
export const castalieBrief = {
  success: true,
  brief: {
    id: 61,
    title: "La ligne sous le prompt dit sur quoi cette copie travaille",
    status: "Ready",
    priority: "P2",
    domain: "method",
    objective_id: null,
  },
  user_stories: [],
};

/** Castalie — `feature_spec_list { feature_brief_id: 61 }`: a brief's specs, listed apart. */
export const castalieSpecList = {
  success: true,
  specs: [
    { id: 54, feature_brief_id: 61, title: "Le panneau à droite du plein écran montre l'arbre stratégique", status: "InProgress", priority: "P2" },
  ],
};

/** Castalie — `strategy_get_objective_breadcrumb { objective_id: 8 }`: `breadcrumb`, not `chain`. */
export const castalieChain = {
  success: true,
  breadcrumb: [
    { id: 8, period_id: 20, parent_objective_id: null, title: "Recette du poste de developpement Castalie", status: "active", computed_progress: 100 },
  ],
};

/** Castalie — `strategy_navigate_children {}`: the objective nested under its row, with its key results. */
export const castalieChildren = {
  success: true,
  objectives: [
    {
      objective: { id: 7, period_id: 20, title: "Valider le marché avec des clients payants", status: "active", computed_progress: 0 },
      parent_title: "",
      key_results: [
        { id: 7, objective_id: 7, title: "Clients payants", metric_type: "number", unit: "clients", start_value: 0, target_value: 10, current_value: 0, computed_progress: 0 },
      ],
    },
    {
      objective: { id: 8, period_id: 20, title: "Recette du poste de developpement Castalie", status: "active", computed_progress: 100 },
      parent_title: "",
      key_results: [
        { id: 8, objective_id: 8, title: "Etapes de recette franchies", metric_type: "number", unit: "etapes", start_value: 0, target_value: 6, current_value: 6, computed_progress: 100 },
      ],
    },
  ],
};

/**
 * The back office's own answers, written the way Castalie writes them — same work, same ids,
 * the other spelling. What the tree builds from both must be the same tree, or the pane
 * draws one workspace and an empty frame for the other.
 */
export const castalieShapedSpec = {
  success: true,
  spec: {
    id: 1109,
    feature_brief_id: 135,
    title: "Split canal × pays dans le fit Meridian — priors par pays, hérités du canal sinon",
    status: "InProgress",
  },
  phases: [
    { id: 2491, title: "Split + calibrateur par cellule", status: "Done" },
    { id: 2492, title: "Bascule Worker1 + fit officiel", status: "InProgress" },
  ],
};

export const castalieShapedBrief = {
  success: true,
  brief: {
    id: 135,
    title: "MMM — moteur d'allocation & application des recos",
    status: "InProgress",
    objective_id: 178,
    objective_title: "Le MMM arbitre les enchères entre les canaux",
  },
};

export const castalieShapedSpecList = {
  success: true,
  specs: backOfficeBrief.brief.Specs.map((spec) => ({ id: spec.Id, title: spec.Title, status: spec.Status })),
};

export const castalieShapedChain = {
  success: true,
  breadcrumb: backOfficeChain.chain.map((node) => ({ id: node.id, title: node.title, period_name: node.period_name })),
};

export const castalieShapedObjective = {
  success: true,
  objectives: [
    {
      objective: { id: 178, title: "Le MMM arbitre les enchères entre les canaux", period_name: "T2 2026" },
      key_results: backOfficeObjective.objective.key_results.map((kr) => ({
        id: kr.id,
        title: kr.title,
        unit: kr.unit,
        current_value: kr.current_value,
        target_value: kr.target_value,
        computed_progress: kr.progress,
      })),
    },
  ],
};
