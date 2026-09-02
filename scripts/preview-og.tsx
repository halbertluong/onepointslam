/**
 * Renders the link-preview card to PNGs so it can be eyeballed without a
 * database or a deploy. Run with:  npx tsx scripts/preview-og.tsx <outDir>
 */
import { writeFile } from 'node:fs/promises';
import { tournamentCard, type OgCardData } from '../src/lib/ogCard';

const CASES: Record<string, OgCardData> = {
  // Live production data, so the check is against what registrants actually see.
  portland: {
    title: 'Portland One Point Bowl Fall 2026',
    school: 'University of Portland Pilots Tennis - Womens',
    primaryColor: '#4B2E83',
    secondaryColor: '#FFFFFF',
    facts: ['Sat, Sep 26', '$80 entry', '128-player draw'],
    cta: 'Register →',
  },
  ucla: {
    title: 'Fall 2026 Charity Cup',
    school: 'UCLA Bruins Tennis',
    primaryColor: '#2D68C4',
    secondaryColor: '#F2A900',
    facts: ['Fri, Oct 30', '$155 entry', '96-player draw'],
    cta: 'Register →',
  },
  paleColors: {
    title: 'Spring Invitational',
    school: 'Sunshine State Tennis',
    primaryColor: '#ffd100',
    secondaryColor: '#fff4b8',
    facts: ['Sun, Mar 8', 'Free entry'],
    cta: 'Register →',
  },
  longName: {
    title: 'The Twenty-Sixth Annual Memorial Invitational Charity Tournament',
    school: 'Some Very Long University Name - Tennis - Womens',
    primaryColor: '#0b3d2e',
    secondaryColor: '#1f7a5c',
    facts: ['Fri, Nov 21', '$40 entry', '64-player draw'],
    cta: 'Register →',
  },
};

async function main() {
  const outDir = process.argv[2] ?? '.';
  for (const [name, data] of Object.entries(CASES)) {
    const png = Buffer.from(await (await tournamentCard(data)).arrayBuffer());
    const path = `${outDir}/og-${name}.png`;
    await writeFile(path, png);
    console.log(`${path}  ${(png.length / 1024).toFixed(0)} KB`);
  }
}

main();
