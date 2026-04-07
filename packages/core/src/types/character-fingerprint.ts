/**
 * CharacterFingerprint: identité visuelle et comportementale stricte d'un personnage.
 * Utilisé pour garantir la cohérence à travers tous les panels/chapitres.
 */

export interface CharacterFingerprint {
  identity: {
    name: string;
    gender: "male" | "female" | "other";
    perceivedAge: string;
    role: string;
  };
  face: {
    faceShape: string;
    eyeShape: string;
    eyeColor: string;
    eyebrowStyle: string;
    noseStyle?: string;
    mouthStyle?: string;
  };
  hair: {
    color: string;
    style: string;
    length: string;
    texture: string;
    silhouette: string;
  };
  body: {
    build: string;
    height: string;
    posture: string;
    silhouette: string;
  };
  /** Marques permanentes qui ne doivent JAMAIS disparaître */
  permanentMarkers: string[];
  /** Tenue par défaut du personnage */
  defaultOutfit: string[];
  /** Dérives interdites (ex: "ne jamais avoir les yeux verts", "jamais de barbe") */
  forbiddenDrift: string[];
  /** URLs des références visuelles primaires */
  primaryRefs: string[];
  /** Trigger word LoRA si disponible */
  loraTrigger?: string;
}
