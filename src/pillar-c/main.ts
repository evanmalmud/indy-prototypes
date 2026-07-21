import { mountPlaceholder } from '../placeholder.ts';

const mount = document.querySelector<HTMLDivElement>('#app');
if (mount !== null) mountPlaceholder(mount);
