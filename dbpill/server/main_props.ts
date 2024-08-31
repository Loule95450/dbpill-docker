import { Greeting } from 'shared/types';
import { MainProps } from 'shared/main_props';

export async function getMainProps(req) {

    return {
        greeting: { text: `Hello from server` } as Greeting,
    } as MainProps;
}