import { useEffect, useContext } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  NavLink as RouterNavLink,
} from 'react-router-dom';
import io from 'socket.io-client';
import styled from 'styled-components';

import './App.css';

import { QueryList } from './components/QueryList';
import { Configs } from './components/Configs';
import { About } from './components/About';

import { AppContext, AppProvider } from './context/AppContext';
import { MainProps } from 'shared/main_props';

/* -------------------------------------------------------------------------- */
/*                                  Styles                                    */
/* -------------------------------------------------------------------------- */

const Container = styled.div`
  font-family: 'Inconsolata', monospace;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: auto;
  background-color: rgba(40, 40, 40, 1);
  color: #fff;

  & code {
    background-color: rgba(255, 255, 255, 0.1);
    padding: 2px 4px;
    border-radius: 4px;
  }
  & pre > code {
    display: block;
    padding: 5px 7px;
    border-radius: 0;
  }
`;

const TextLogo = styled.div`
  font-size: 30px;
  font-weight: 700;
  text-transform: lowercase;
  letter-spacing: 2px;
  border: 1px solid color(display-p3 0.964 0.7613 0.3253);
  color: color(display-p3 0.964 0.7613 0.3253);
  background: linear-gradient(to right, rgba(86, 65, 9, 0.8) 25%, rgba(59, 40, 7, 0.8) 75%);
  display: inline-block;
  padding: 0 20px;
  margin-right: 10px;
  border-radius: 30px;
  position: relative;
`;

const NavBar = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  background-color: rgba(0, 0, 0, 1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
`;

const DbInfo = styled.div`
  margin-left: auto;
  font-size: 14px;
`;

const InfoTable = styled.table`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  border-collapse: collapse;

  th, td {
    padding: 2px 6px;
  }

  th {
    opacity: 0.5;
  }

  th:first-child, td:first-child {
    text-align: right;
    font-weight: 600;
  }
`;

const StyledNavLink = styled(RouterNavLink)`
  cursor: pointer;
  text-decoration: none;
  padding: 8px 12px;
  color: #fff;
  border: 2px solid transparent;

  &:hover {
    border-bottom-color: #ffffff77;
  }

  &.active {
    border-bottom-color: #fff;
  }
`;

const MainContent = styled.div`
  flex-grow: 1;
  padding: 20px;
  background-color: rgb(74, 73, 71);
`;

/* -------------------------------------------------------------------------- */

function NavBarContent({ args }: { args: MainProps['args'] }) {
  const { config } = useContext(AppContext);

  return (
    <>
      <TextLogo>dbpill</TextLogo>
      {/* RouterNavLink automatically adds the `active` class */}
      <StyledNavLink to="/">Queries</StyledNavLink>
      <StyledNavLink to="/config">Config</StyledNavLink>
      <StyledNavLink to="/about">About</StyledNavLink>

      {/* Show current DB connection info and LLM info */}
      {(() => {
        try {
          const dbUrl = new URL(args.db);
          const host = dbUrl.hostname;
          const port = dbUrl.port || '5432';
          const dbName = dbUrl.pathname.replace(/^\/+/, '');
          const proxyPort = args.proxyPort || 5433;
          
          // Get LLM info - only use config values
          const llmEndpoint = config?.llm_endpoint || 'anthropic';
          const llmModel = config?.llm_model || 'claude-sonnet-4';
          
          // Format LLM provider name for display
          let llmProvider = llmEndpoint;
          if (llmEndpoint === 'anthropic') {
            llmProvider = 'Anthropic';
          } else if (llmEndpoint === 'openai') {
            llmProvider = 'OpenAI';
          } else if (llmEndpoint.startsWith('http')) {
            // Custom URL - extract domain for display
            try {
              const url = new URL(llmEndpoint);
              llmProvider = url.hostname;
            } catch {
              llmProvider = 'Custom';
            }
          }
          
          return (
            <DbInfo>
              <InfoTable>
                <tbody>
                  <tr>
                    <th>Proxy</th>
                    <td style={{color: 'rgba(255, 255, 180, 1)'}}>{`:${proxyPort} → ${host}:${port}/${dbName}`}</td>
                  </tr>
                  <tr>
                    <th>LLM</th>
                    <td>{`${llmProvider} • ${llmModel}`}</td>
                  </tr>
                </tbody>
              </InfoTable>
            </DbInfo>
          );
        } catch (_) {
          return null;
        }
      })()}
    </>
  );
}

function App({ args }: MainProps) {
  // Establish socket connection (same behaviour as before)
  useEffect(() => {
    const socket = io();
    socket.on('connect', () => {
      console.log('connected to socket.io');
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <AppProvider args={args}>
      <Router>
        <Container>
          <NavBar>
            <NavBarContent args={args} />
          </NavBar>

          <MainContent>
            <Routes>
              <Route path="/" element={<QueryList />} />
              <Route path="/config" element={<Configs />} />
              <Route path="/about" element={<About />} />
            </Routes>
          </MainContent>
        </Container>
      </Router>
    </AppProvider>
  );
}

export default App; 