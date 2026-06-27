import { Drawer as DrawerPrimitive } from 'vaul-svelte';
import Root from './drawer.svelte';
import Content from './drawer-content.svelte';
import Overlay from './drawer-overlay.svelte';
import Header from './drawer-header.svelte';
import Footer from './drawer-footer.svelte';
import Title from './drawer-title.svelte';
import Description from './drawer-description.svelte';

const Trigger = DrawerPrimitive.Trigger;
const Close = DrawerPrimitive.Close;
const Portal = DrawerPrimitive.Portal;
const NestedRoot = DrawerPrimitive.NestedRoot;

export {
	Root,
	Content,
	Overlay,
	Header,
	Footer,
	Title,
	Description,
	Trigger,
	Close,
	Portal,
	NestedRoot,
	Root as Drawer
};
