import ReactDOMServer from 'react-dom/server'
import App from '../client/App'

// if you need to integrate other styling frameworks,
// implement them here & add to the head tags for SSR
import { ServerStyleSheet } from "styled-components";
import {getMainProps} from "./main_props";

const mainProps = await getMainProps({});

export function render(url, context) {
  const sheet = new ServerStyleSheet();
  const body = ReactDOMServer.renderToString(
    sheet.collectStyles(
      <App {...mainProps} />
    )
  )
  return {
    body,
    head: sheet.getStyleTags()
  }
}