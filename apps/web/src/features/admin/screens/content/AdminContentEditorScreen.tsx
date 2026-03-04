import { CoreAlert as Alert } from '../../../../design-system';
import { useParams } from 'react-router-dom';
import { ContentEditor } from '../../../../pages/ContentPage';

const EDITABLE_SLUGS = new Set([
  'about',
  'faq',
  'contact',
  'feedback',
  'code-of-conduct',
  'legal',
  'terms',
  'privacy',
]);

export function AdminContentEditorScreen() {
  const { slug } = useParams<{ slug: string }>();
  const pageSlug = String(slug ?? '').toLowerCase();

  if (!EDITABLE_SLUGS.has(pageSlug)) {
    return <Alert color="red">Unknown content page.</Alert>;
  }

  return <ContentEditor slug={pageSlug} />;
}
