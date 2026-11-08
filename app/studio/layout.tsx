import type {ReactNode} from 'react';
import '../studio-lab/variants.css';

export default function StudioLayout({children}:{children:ReactNode}){
  return <div className="lab-variant studio-default" data-variant="orbit-blue" data-layout="orbit">{children}</div>;
}
