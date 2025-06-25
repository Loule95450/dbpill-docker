import { Greeting } from 'shared/types';
import { MainProps } from 'shared/main_props';
import argv from './args';

export async function getMainProps(req) {

    return {
        args: argv,
    } as MainProps;
}