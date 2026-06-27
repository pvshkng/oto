import { Dialog as DialogPrimitive } from 'bits-ui';
import Overlay from './dialog-overlay.svelte';
import Content from './dialog-content.svelte';
import Title from './dialog-title.svelte';
import Description from './dialog-description.svelte';

const Root = DialogPrimitive.Root;
const Trigger = DialogPrimitive.Trigger;
const Close = DialogPrimitive.Close;
const Portal = DialogPrimitive.Portal;

export { Root, Trigger, Close, Portal, Overlay, Content, Title, Description };
