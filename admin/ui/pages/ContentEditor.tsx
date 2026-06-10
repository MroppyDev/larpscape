// Content editor hub: routes /content/:section to the matching editor.
import { useParams } from 'react-router-dom';
import ItemsEditor from './content/ItemsEditor';
import NpcsEditor from './content/NpcsEditor';
import ObjectsEditor from './content/ObjectsEditor';
import ShopsEditor from './content/ShopsEditor';
import RecipesEditor from './content/RecipesEditor';
import MagicEditor from './content/MagicEditor';
import SpawnsEditor from './content/SpawnsEditor';

export default function ContentEditor() {
  const { section } = useParams<{ section: string }>();

  switch (section) {
    case 'items': return <ItemsEditor />;
    case 'npcs': return <NpcsEditor />;
    case 'objects': return <ObjectsEditor />;
    case 'shops': return <ShopsEditor />;
    case 'recipes': return <RecipesEditor />;
    case 'magic': return <MagicEditor />;
    case 'spawns': return <SpawnsEditor />;
    default:
      return (
        <div>
          <h1>Content</h1>
          <div className="card error-text">Unknown content section: {section}</div>
        </div>
      );
  }
}
