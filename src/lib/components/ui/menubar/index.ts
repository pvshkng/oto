import { Menubar as MenubarPrimitive } from 'bits-ui';
import Root from './menubar.svelte';
import Trigger from './menubar-trigger.svelte';
import Content from './menubar-content.svelte';
import Item from './menubar-item.svelte';
import Separator from './menubar-separator.svelte';
import SubTrigger from './menubar-sub-trigger.svelte';
import SubContent from './menubar-sub-content.svelte';

const Menu = MenubarPrimitive.Menu;
const Sub = MenubarPrimitive.Sub;
const Group = MenubarPrimitive.Group;

export {
	Root,
	Trigger,
	Content,
	Item,
	Separator,
	SubTrigger,
	SubContent,
	Menu,
	Sub,
	Group,
	Root as Menubar
};
