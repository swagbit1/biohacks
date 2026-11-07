import './style.css';
import type {ReactNode} from 'react';
export const metadata = {title:'EverVoice Studio', description:'Keep the way you say it.'};
export default function Layout({children}:{children:ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
