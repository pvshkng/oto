import { ContextMenu as ContextMenuPrimitive } from 'bits-ui';
import Content from './context-menu-content.svelte';
import Item from './context-menu-item.svelte';
import Separator from './context-menu-separator.svelte';
import GroupHeading from './context-menu-group-heading.svelte';
import SubTrigger from './context-menu-sub-trigger.svelte';
import SubContent from './context-menu-sub-content.svelte';

const Root = ContextMenuPrimitive.Root;
const Trigger = ContextMenuPrimitive.Trigger;
const Group = ContextMenuPrimitive.Group;
const Sub = ContextMenuPrimitive.Sub;
const Portal = ContextMenuPrimitive.Portal;

export {
	Root,
	Trigger,
	Group,
	Sub,
	Portal,
	Content,
	Item,
	Separator,
	GroupHeading,
	SubTrigger,
	SubContent
};
