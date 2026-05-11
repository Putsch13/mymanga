/**
 * Application des `PropTemplate` (legacy) à un beat.
 *
 * Pour chaque template déclenché par le texte du beat, produit une
 * `RequiredProp`. Court-circuité par le pipeline IA-first quand
 * `suppressUniverseTemplates` est actif.
 */
import type { NarrativeFact, ProductionBeat, RequiredProp } from "@manga-ai-studio/core";
import {
  makeVisibilityMode,
  matchesStrictPremiumPropEvidence,
  requiresVisibility,
  STRICT_PREMIUM_PROP_NAMES,
} from "../prop-evidence-validator";
import { inferPropOwnerCategory } from "../prop-owner-resolver";
import { MILITARY_PROPS } from "./templates";
import {
  detectUniverseFromContext,
  getAdditionalDomainsOnlyIfExplicitlySignaled,
  getUniverseProps,
} from "./universe";
import type { PropTemplate, UniverseType } from "./types";

export interface ApplyTemplatesArgs {
  beat: ProductionBeat;
  text: string;
  universeType: UniverseType;
  suppressUniverseTemplates: boolean;
  premiumStrictChapterSourcing: boolean;
  heroCharacterId?: string | null;
  seenNames: Set<string>;
}

export function applyTemplateHeuristics(args: ApplyTemplatesArgs): RequiredProp[] {
  const {
    beat,
    text,
    universeType,
    suppressUniverseTemplates,
    premiumStrictChapterSourcing,
    heroCharacterId,
    seenNames,
  } = args;

  const props: RequiredProp[] = [];

  const allDomains: PropTemplate[][] = suppressUniverseTemplates
    ? []
    : [
        getUniverseProps(universeType),
        ...getAdditionalDomainsOnlyIfExplicitlySignaled(text),
      ];

  const testedTemplates = new Set<string>();
  const flatTemplates: PropTemplate[] = [];
  for (const domain of allDomains) {
    for (const tpl of domain) {
      if (!testedTemplates.has(tpl.canonicalName)) {
        testedTemplates.add(tpl.canonicalName);
        flatTemplates.push(tpl);
      }
    }
  }

  const lowerText = text.toLowerCase();
  for (const template of flatTemplates) {
    const triggered = template.triggers.some((trigger) =>
      lowerText.includes(trigger.toLowerCase()),
    );
    if (!triggered) continue;
    if (
      premiumStrictChapterSourcing &&
      STRICT_PREMIUM_PROP_NAMES.has(template.canonicalName.trim().toLowerCase()) &&
      !matchesStrictPremiumPropEvidence(template, text)
    ) {
      continue;
    }
    if (seenNames.has(template.canonicalName)) continue;
    seenNames.add(template.canonicalName);

    const mustBeVisible =
      requiresVisibility(text) ||
      template.narrativeRole === "action_tool" ||
      template.narrativeRole === "threat";
    const visibilityMode = makeVisibilityMode(text, template.defaultVisibilityMode);
    const isMilitaryEquipment =
      template.category === "equipment" &&
      MILITARY_PROPS.some((p) => p.canonicalName === template.canonicalName);
    const ownerCategory = inferPropOwnerCategory(
      template,
      text,
      {
        universeType,
        heroCharacterId: heroCharacterId ?? null,
      },
      isMilitaryEquipment,
    );

    props.push({
      id: `prop_${beat.beatId}_${template.canonicalName.replace(/\s+/g, "_")}`,
      canonicalName: template.canonicalName,
      aliases: template.aliases,
      category: template.category,
      narrativeRole: template.narrativeRole,
      requiredForBeatIds: [beat.beatId],
      visibilityMode,
      mustBeVisible,
      confidence: template.confidence,
      source: "story_inference",
      ownerCategory,
    });
  }

  return props;
}

export interface ApplyFactsArgs {
  beat: ProductionBeat;
  text: string;
  facts: NarrativeFact[];
  universeType: UniverseType;
  heroCharacterId?: string | null;
  seenNames: Set<string>;
}

export function applyNarrativeFacts(args: ApplyFactsArgs): RequiredProp[] {
  const { beat, text, facts, universeType, heroCharacterId, seenNames } = args;
  const props: RequiredProp[] = [];

  for (const fact of facts) {
    if (
      (fact.type !== "prop_usage" && fact.type !== "prop_transfer") ||
      fact.beatId !== beat.beatId
    ) {
      continue;
    }
    for (const candidate of fact.propCandidates) {
      if (seenNames.has(candidate)) continue;
      seenNames.add(candidate);
      const narrativeRole = fact.type === "prop_transfer" ? "payoff" : "action_tool";
      const defaultVisibilityMode =
        fact.requiredVisibility === "must_show" ? "foreground_insert" : "background_support";
      const ownerCategory = inferPropOwnerCategory(
        {
          canonicalName: candidate,
          category: "inferred",
          narrativeRole,
          defaultVisibilityMode,
        },
        text,
        {
          universeType,
          heroCharacterId: heroCharacterId ?? null,
        },
        false,
      );
      props.push({
        id: `prop_fact_${beat.beatId}_${candidate.replace(/\s+/g, "_")}`,
        canonicalName: candidate,
        aliases: [],
        category: "inferred",
        narrativeRole,
        requiredForBeatIds: [beat.beatId],
        visibilityMode:
          fact.requiredVisibility === "must_show"
            ? "foreground_insert"
            : "background_support",
        mustBeVisible: fact.requiredVisibility === "must_show",
        confidence: fact.evidenceStrength,
        source: fact.source === "continuity" ? "continuity" : "story_inference",
        ownerCategory,
      });
    }
  }

  return props;
}
