import Link from 'next/link';
import {notFound} from 'next/navigation';
import Studio from '../../studio/page';
import {comparisonVariants,studioVariants} from '../variants';

export function generateStaticParams(){
  return studioVariants.map(item=>({variant:item.id}));
}

export default async function StudioVariant({params}:{params:Promise<{variant:string}>}){
  const {variant}=await params;
  const selected=studioVariants.find(item=>item.id===variant);
  if(!selected)notFound();

  return <div className="lab-variant" data-variant={selected.id} data-layout={selected.id.startsWith('orbit')?'orbit':selected.id}>
    <div className="lab-switcher" aria-label="Compare Studio variants">
      <Link href="/studio-lab">← Compare</Link>
      {comparisonVariants.map(item=><Link key={item.id} href={'/studio-lab/'+item.id} aria-current={item.id===selected.id?'page':undefined}>
        {item.letter} · {item.name}
      </Link>)}
      <Link href="/studio">Main Studio</Link>
    </div>
    <Studio/>
  </div>;
}
