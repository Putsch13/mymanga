/**
 * Barre d'actions par panel review : valider, comparer, rerolls (legacy
 * + premium ciblés). Les boutons premium n'apparaissent que si le score
 * de l'axe correspondant est sous 0.7.
 */
"use client";

import { Button } from "@/components/ui/button";
import { getRerollModeFromAction, type ReviewPanel } from "./types";

export interface ReviewPanelActionsProps {
  panel: ReviewPanel;
  validatedPanels: Record<string, boolean>;
  comparePanels: Record<string, boolean>;
  onValidate: (panelId: string, validated: boolean) => void | Promise<void>;
  onToggleCompare: (panelId: string) => void;
  onReroll: (panelId: string, mode: string) => void | Promise<void>;
}

export function ReviewPanelActions(props: ReviewPanelActionsProps) {
  const { panel, validatedPanels, comparePanels, onValidate, onToggleCompare, onReroll } = props;
  const isValidated = Boolean(validatedPanels[panel.panelId]);

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {panel.status === "completed" ? (
        <Button
          data-testid={`validate-panel-${panel.panelId}`}
          variant={isValidated ? "default" : "secondary"}
          size="sm"
          className={
            isValidated
              ? "border-green-500/40 bg-green-500/15 text-green-700 hover:bg-green-500/20"
              : "border-green-500/30 text-green-600 hover:bg-green-500/10"
          }
          onClick={() => void onValidate(panel.panelId, !isValidated)}
        >
          {isValidated ? "✓ Validée" : "Accepter"}
        </Button>
      ) : null}

      {panel.previousImageUrl ? (
        <Button
          data-testid={`compare-panel-${panel.panelId}`}
          variant="secondary"
          size="sm"
          onClick={() => onToggleCompare(panel.panelId)}
        >
          {comparePanels[panel.panelId] ? "Masquer" : "Comparer"}
        </Button>
      ) : null}

      {panel.recommendedAction && panel.recommendedAction !== "keep" ? (
        <Button
          data-testid={`reroll-recommended-${panel.panelId}`}
          variant="default"
          size="sm"
          onClick={() => void onReroll(panel.panelId, getRerollModeFromAction(panel.recommendedAction))}
        >
          Reroll{" "}
          {panel.recommendedAction === "style_reroll"
            ? "style"
            : panel.recommendedAction === "character_reroll"
              ? "personnage"
              : "ciblé"}
        </Button>
      ) : null}

      <Button variant="outline" size="sm" onClick={() => void onReroll(panel.panelId, "environment")}>
        Reroll décor
      </Button>
      <Button variant="outline" size="sm" onClick={() => void onReroll(panel.panelId, "character")}>
        Reroll perso
      </Button>
      <Button variant="ghost" size="sm" onClick={() => void onReroll(panel.panelId, "style")}>
        Reroll style
      </Button>

      <PremiumRerollButton
        when={panel.axisScores.propComplianceScore}
        threshold={0.7}
        testId={`reroll-prop-${panel.panelId}`}
        label="Reroll prop"
        toneClass="border-orange-500/40 text-orange-600 hover:bg-orange-500/10"
        onClick={() => void onReroll(panel.panelId, "prop")}
      />
      <PremiumRerollButton
        when={panel.axisScores.enemyPresenceScore}
        threshold={0.7}
        testId={`reroll-enemy-${panel.panelId}`}
        label="Reroll ennemi"
        toneClass="border-red-500/40 text-red-600 hover:bg-red-500/10"
        onClick={() => void onReroll(panel.panelId, "enemy_presence")}
      />
      <PremiumRerollButton
        when={panel.axisScores.dialogueAnchorScore}
        threshold={0.7}
        testId={`reroll-speaker-${panel.panelId}`}
        label="Reroll speaker"
        toneClass="border-blue-500/40 text-blue-600 hover:bg-blue-500/10"
        onClick={() => void onReroll(panel.panelId, "speaker")}
      />
      <PremiumRerollButton
        when={panel.axisScores.subjectFocusScore}
        threshold={0.7}
        testId={`reroll-focus-${panel.panelId}`}
        label="Reroll focus"
        toneClass="border-purple-500/40 text-purple-600 hover:bg-purple-500/10"
        onClick={() => void onReroll(panel.panelId, "subject_focus")}
      />
      <PremiumRerollButton
        when={panel.axisScores.populationScore}
        threshold={0.7}
        testId={`reroll-population-${panel.panelId}`}
        label="Reroll PNJ"
        toneClass="border-teal-500/40 text-teal-600 hover:bg-teal-500/10"
        onClick={() => void onReroll(panel.panelId, "npc_population")}
      />
      <PremiumRerollButton
        when={panel.axisScores.cutawayComplianceScore}
        threshold={0.7}
        testId={`reroll-cutaway-${panel.panelId}`}
        label="Reroll cutaway"
        toneClass="border-slate-500/40 text-slate-400 hover:bg-slate-500/10"
        onClick={() => void onReroll(panel.panelId, "cutaway")}
      />
    </div>
  );
}

function PremiumRerollButton(props: {
  when: number | undefined;
  threshold: number;
  testId: string;
  label: string;
  toneClass: string;
  onClick: () => void;
}) {
  if (props.when === undefined || props.when >= props.threshold) return null;
  return (
    <Button
      data-testid={props.testId}
      variant="outline"
      size="sm"
      className={props.toneClass}
      onClick={props.onClick}
    >
      {props.label}
    </Button>
  );
}
