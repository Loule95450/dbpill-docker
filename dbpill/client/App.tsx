import { useEffect } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  NavLink as RouterNavLink,
} from 'react-router-dom';
import io from 'socket.io-client';
import styled from 'styled-components';

import './App.css';
// @ts-ignore – kept to avoid breaking any existing usage of the logo import
import logo from './assets/dbpill.png';

import { Home } from './components/Home';
import { QueryList } from './components/QueryList';
import { QueryDetail } from './components/QueryDetail';
import { AppliedIndexes } from './components/AppliedIndexes';

import { AppContext } from './context/AppContext';
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
    <AppContext.Provider value={{ args }}>
      <Router>
        <Container>
          <NavBar>
            <TextLogo>dbpill</TextLogo>
            {/* RouterNavLink automatically adds the `active` class */}
            <StyledNavLink to="/" end>
              Instructions
            </StyledNavLink>
            <StyledNavLink to="/queries">Queries</StyledNavLink>
            <StyledNavLink to="/indexes">Indexes</StyledNavLink>
          </NavBar>

          <MainContent>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/queries" element={<QueryList />} />
              <Route path="/query/:query_id" element={<QueryDetail />} />
              <Route path="/indexes" element={<AppliedIndexes />} />
            </Routes>
          </MainContent>
        </Container>
      </Router>
    </AppContext.Provider>
  );
}

export default App; 