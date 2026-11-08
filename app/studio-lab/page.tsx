import Link from 'next/link';
import {comparisonVariants} from './variants';

export default function StudioLab(){
  return <main className="lab-index">
    <Link href="/studio">← Main Studio</Link>
    <h1>EverVoice Studio Lab</h1>
    <p>Compare two finishes on the same Orbit layout.</p>
    <div className="lab-cards">
      {comparisonVariants.map(variant=><Link className="lab-card" data-variant={variant.id} key={variant.id} href={'/studio-lab/'+variant.id}>
        <span>{variant.letter} · {variant.layout}</span>
        <div className="lab-mini" aria-hidden="true"><i/><i/><i/></div>
        <strong>{variant.name}</strong>
        <p>{variant.palette}. {variant.description}</p>
        <span>Open {variant.name} →</span>
      </Link>)}
    </div>
  </main>;
}
