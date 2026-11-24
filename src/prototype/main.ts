import { mount } from 'svelte';
import '../app.css';
import Prototype from './Prototype.svelte';

mount(Prototype, { target: document.getElementById('app')! });
