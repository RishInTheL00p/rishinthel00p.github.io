// Plain-language security summary, shared by the homepage callout and the
// /security page. Each item's `id` is the anchor of its technical section on
// /security, so every plain statement links to the detail that backs it.
import { contact } from './content.ts';

export type SecurityItem = { id: string; label: string; plain: string };

const items: (SecurityItem & { contactOnly?: boolean })[] = [
  {
    id: 'page-integrity',
    label: 'Page integrity',
    plain: "Only code I've approved can run here. Nothing can be injected from outside.",
  },
  {
    id: 'visitor-privacy',
    label: 'Visitor privacy',
    plain: 'No tracking cookies, no analytics, no ads. Nobody is followed around.',
  },
  {
    id: 'contact-form',
    label: 'Contact form',
    plain: 'Accepts messages only from this site, limits how many can be sent, and pauses itself if a safety check is down.',
    contactOnly: true,
  },
  {
    id: 'outside-code',
    label: 'Outside code',
    plain: 'Every third-party package and build tool is pinned to a known version and scanned for known flaws.',
  },
  {
    id: 'data-leaks',
    label: 'Data leaks',
    plain: 'Every change is scanned for personal data and passwords before it goes live.',
  },
  {
    id: 'accuracy',
    label: 'Accuracy',
    plain: 'My work history, skills and credentials are checked against my resume on every build.',
  },
];

/** The items that apply to this build (the contact item only when the form is on). */
export const securitySummary: SecurityItem[] = items
  .filter((i) => !i.contactOnly || contact)
  .map(({ id, label, plain }) => ({ id, label, plain }));
