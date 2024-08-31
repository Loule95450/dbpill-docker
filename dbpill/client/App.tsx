import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink as RouterNavLink, Navigate } from 'react-router-dom';
import { Greeting, SocketTester } from 'shared/types';
import { MainProps } from 'shared/main_props';
import io from 'socket.io-client';
// @ts-ignore
import logo from './assets/dbpill.png';
import './App.css';
import styled from 'styled-components';

const Container = styled.div`
  font-family: monospace;
  display: flex;
  flex-direction: column;
  height: 100vh;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background-color: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
`;

const Logo = styled.img`
  height: 40px;
`;

const Controls = styled.div`
  display: flex;
  gap: 10px;
`;

const Button = styled.button`
  padding: 5px 10px;
  font-family: monospace;
`;

const NavBar = styled.div`
  display: flex;
  gap: 10px;
  padding: 10px;
  background-color: #e9ecef;
  border-bottom: 1px solid #dee2e6;
`;

const StyledNavLink = styled(RouterNavLink)`
  cursor: pointer;
  text-decoration: none;
  color: #007bff;
  font-family: monospace;

  padding: 0 5px;
  background-color: #f8f9fa;
  line-height: 1.5em;

  border: 1px solid transparent;

  &.active {
    border-color: #007bff;
  }

  &:hover {
    text-decoration: underline;
  }
`;

const MainContent = styled.div`
  flex-grow: 1;
  padding: 20px;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
  font-family: Arial, sans-serif;
`;

const TableRow = styled.tr`
`;

const TableHeader = styled.th`
  padding: 12px;
  background-color: #007bff;
  color: white;
  border: 1px solid #dee2e6;
`;

const TableData = styled.td`
  padding: 12px;
  line-height: 1.2em;
  border: 1px solid #dee2e6;
  max-width: 20vw;
  vertical-align: top;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
`;

const QueryText = styled.pre`
  text-align: left;
  white-space: pre-wrap;
  max-height: 200px;
  overflow: auto;
  background-color: #f8f9fa;
  padding: 10px;
  margin: -10px;
  display: block;
`;

const QueryParams = styled.pre`
  white-space: pre-wrap;
  max-height: 200px;
  overflow: auto;
`;

const QueryPlan = styled.pre`
  white-space: pre-wrap;
  max-height: 200px;
  overflow: auto;
`;

const formatNumber = (num: number) => num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function AllQueries() {
  const [stats, setStats] = useState<any[]>([]);
  const [orderBy, setOrderBy] = useState<string>('timestamp');
  const [orderDirection, setOrderDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetch('/api/all_queries', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then((response) => response.json())
      .then((data) => {
        setStats(data.stats);
        setOrderBy(data.orderBy);
        setOrderDirection(data.orderDirection);
      });
  }, []);

  return (
    <div>
      <h1>All Queries</h1>
      <Table>
        <thead>
          <TableRow>
            <TableHeader>
              <a href={`?orderBy=query_id&direction=${orderDirection === 'asc' ? 'desc' : 'asc'}`}>ID {orderBy === 'query_id' ? (orderDirection === 'asc' ? '▲' : '▼') : ''}</a>
            </TableHeader>
            <TableHeader>
              <a href={`?orderBy=query&direction=${orderDirection === 'asc' ? 'desc' : 'asc'}`}>Query {orderBy === 'query' ? (orderDirection === 'asc' ? '▲' : '▼') : ''}</a>
            </TableHeader>
            <TableHeader>
              <a href={`?orderBy=plan_time&direction=${orderDirection === 'asc' ? 'desc' : 'asc'}`}>Plan Time {orderBy === 'plan_time' ? (orderDirection === 'asc' ? '▲' : '▼') : ''}</a>
            </TableHeader>
            <TableHeader>
              <a href={`?orderBy=exec_time&direction=${orderDirection === 'asc' ? 'desc' : 'asc'}`}>Exec Time {orderBy === 'exec_time' ? (orderDirection === 'asc' ? '▲' : '▼') : ''}</a>
            </TableHeader>
            <TableHeader>
              <a href={`?orderBy=timestamp&direction=${orderDirection === 'asc' ? 'desc' : 'asc'}`}>Timestamp {orderBy === 'timestamp' ? (orderDirection === 'asc' ? '▲' : '▼') : ''}</a>
            </TableHeader>
          </TableRow>
        </thead>
        <tbody>
          {stats.map((stat) => {
            const formatted_query = stat.query;
            return (
              <TableRow key={stat.query_id}>
                <TableData><a href={`/suggest?query_id=${stat.query_id}`}>{stat.query_id}</a></TableData>
                <TableData><QueryText>{formatted_query}</QueryText></TableData>
                <TableData>{formatNumber(stat.plan_time)}ms</TableData>
                <TableData>{formatNumber(stat.exec_time)}ms</TableData>
                <TableData>{stat.timestamp}</TableData>
              </TableRow>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}

function SlowQueries() {
  return <div>Slow Queries</div>;
}

function Home() {
  return <div>Home Content</div>;
}

function App(mainProps: MainProps) {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    const socket = io();
    socket.on('connect', () => {
      console.log('connected to socket.io');
    });

    socket.on('test', (data: SocketTester) => {
      setCount(data.counter);
    });

    return () => {
      socket.disconnect();
    }
  }, []);

  return (
    <Router>
      <Container>
        <Header>
          <Logo src={logo} alt="logo" />
          <Controls>
            <p>Intercepted {count} queries </p>
            <Button>⏹ Stop</Button>
          </Controls>
        </Header>
        <NavBar>
          <StyledNavLink to="/" className={location.pathname === '/' ? 'active' : ''}>Home</StyledNavLink>
          <StyledNavLink to="/all-queries">All Queries</StyledNavLink>
          <StyledNavLink to="/slow-queries">Slow Queries</StyledNavLink>
        </NavBar>
        <MainContent>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/all-queries" element={<AllQueries />} />
            <Route path="/slow-queries" element={<SlowQueries />} />
          </Routes>
        </MainContent>
      </Container>
    </Router>
  );
}

export default App;
