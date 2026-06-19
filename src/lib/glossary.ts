import { GLOSSARY } from '../data/glossary';

export interface GlossHit {
  term: string;
  def: string;
}

// Substring-based match: the first glossary key found in the name wins.
export function glossDef(name: string | undefined | null): GlossHit | null {
  if (!name) return null;
  for (const k in GLOSSARY) {
    if (name.indexOf(k) >= 0) return { term: k, def: GLOSSARY[k] };
  }
  return null;
}
