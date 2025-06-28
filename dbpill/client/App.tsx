import { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink as RouterNavLink, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Greeting, SocketTester } from 'shared/types';
import { MainProps } from 'shared/main_props';
import io from 'socket.io-client';
// @ts-ignore
import logo from './assets/dbpill.png';
import './App.css';
import styled from 'styled-components';

// markdown formatter
import ReactMarkdown from 'react-markdown';

const AppContext = createContext<{ args: any }>({ args: {} });

const Container = styled.div`
  font-family: "Inconsolata", monospace;
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
    font-size: 25px;
    font-weight: 700;
    text-transform: lowercase;
    letter-spacing: 2px;
    border: 1px solid color(display-p3 0.964 0.7613 0.3253);
    color: color(display-p3 0.964 0.7613 0.3253);
    background: linear-gradient(to right, rgba(86, 65, 9, 0.8) 25%, rgba(59, 40, 7, 0.8) 75%);
    display: inline-block;
    padding: 0;
    line-height: 60px;
    border-radius: 30px;
    position: relative;

`;

const NavBar = styled.div`
  display: flex;
  gap: 10px;
  padding: 10px;
  line-height: 40px;
  background-color: rgba(0, 0, 0, 1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
`;

const StyledNavLink = styled(RouterNavLink)`
  cursor: pointer;
  text-decoration: none;
  padding: 0 5px;
  height: 30px;

  color: #fff;
  border-bottom: 1px solid transparent;

  &:hover {
    box-shadow: 0 2px 0 0 #ffffff77;
  }

  &.active {
    box-shadow: 0 2px 0 0 #fff;
  }
`;

const MainContent = styled.div`
  flex-grow: 1;
  padding: 20px;
  background-color: rgba(35, 35, 35, 1);
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
  background-color: rgba(45, 45, 45, 1);
`;

const TableRow = styled.tr`
  background-color: rgba(45, 45, 45, 1);
  &:nth-child(even) {
    background-color: rgba(50, 50, 50, 1);
  }
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
`;

const TableData = styled.td`
  padding: 12px;
  line-height: 1.2em;
  max-width: 20vw;
  vertical-align: top;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  text-align: left;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
`;

const QueryStats = styled.div`
  display: flex;
  flex-direction: column;
  text-align: left;
`;

const QueryStat = styled.div`
  padding: 0 2px 2px 2px;
`;


const QueryText = styled.pre<{ $expanded?: boolean }>`
  text-align: left;
  white-space: pre-wrap;
  padding: 12px;
  margin: 0;
  display: block;
  background-color: rgba(20, 20, 20, 1);
  color: rgba(255, 255, 255, 0.95);
  font-size: 13px;
  line-height: 1.4;
  cursor: pointer;
  
  ${props => !props.$expanded && `
    max-height: 120px;
    overflow: hidden;
    position: relative;
    
    &::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      height: 20px;
      width: 100%;
      background: linear-gradient(transparent, rgba(20, 20, 20, 1));
      pointer-events: none;
    }
    
    &:hover {
      border-color: rgba(255, 255, 255, 0.3);
    }
  `}

  ${props => props.$expanded && `
    max-height: none;
  `}
`;

const QueryExpandHint = styled.div`
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 4px;
  font-style: italic;
`;

const QuerySort = styled.span`
  user-select: none;
`;

const QuerySortOption = styled.span<{ active?: string }>`
  cursor: pointer;
  display: inline-block;
  margin: 0 5px;
  padding: 0 5px;
  line-height: 20px;
  user-select: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.8);

  &:hover {
    box-shadow: 0 2px 0 0 rgba(255, 255, 255, 0.5);
    color: #fff;
  }

  ${props => props.active == 'true' && `
    box-shadow: 0 2px 0 0 #fff;
    color: #fff;
  `}
`;

const RowIndex = styled.span`
  opacity: 0.2;
  font-size: 1.2em;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ai-suggestion' }>`
  padding: 6px 10px;
  font-family: "Inconsolata", monospace;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: transparent;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  margin: 0;
  line-height: 1.2;
  min-width: 70px;
  transition: all 0.15s ease;
  border-radius: 0;
  
  ${props => props.$variant === 'primary' && `
    border-color: #6366f1;
    color: #6366f1;
    
    &:hover {
      background: rgba(99, 102, 241, 0.1);
      border-color: #8b5cf6;
      color: #8b5cf6;
    }
  `}

  ${props => props.$variant === 'ai-suggestion' && `
    border-color: #3B82F6;
    color: #3B82F6;
    padding: 12px 20px;
    font-size: 12px;
    min-width: 140px;
    font-weight: 600;
    width: auto;
    flex-shrink: 0;
    
    &:hover {
      background: rgba(59, 130, 246, 0.1);
      border-color: #60A5FA;
      color: #60A5FA;
    }
  `}

  ${props => props.$variant === 'success' && `
    border-color: #10b981;
    color: #10b981;
    
    &:hover {
      background: rgba(16, 185, 129, 0.1);
      border-color: #34d399;
      color: #34d399;
    }
  `}

  ${props => props.$variant === 'danger' && `
    border-color: #ef4444;
    color: #ef4444;
    
    &:hover {
      background: rgba(239, 68, 68, 0.1);
      border-color: #f87171;
      color: #f87171;
    }
  `}

  ${props => (!props.$variant || props.$variant === 'secondary') && `
    border-color: rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.8);
    
    &:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.4);
      color: rgba(255, 255, 255, 1);
    }
  `}
  
  &:active {
    background: rgba(255, 255, 255, 0.1);
  }
  
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    border-color: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.4);
  }
`;

const StatsCard = styled.div`
  background: rgba(30, 30, 30, 1);
  border-radius: 0;
  padding: 12px;
  margin-bottom: 8px;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
  margin-bottom: 8px;
`;

const StatItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
  
  &:not(:last-child) {
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  }
`;

const StatLabel = styled.span`
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  font-weight: 500;
`;

const StatValue = styled.span<{ $trend?: 'up' | 'down' | 'neutral' }>`
  font-size: 12px;
  font-weight: 600;
  font-family: 'Inconsolata', monospace;
  
  ${props => props.$trend === 'up' && `
    color: #10B981;
  `}
  
  ${props => props.$trend === 'down' && `
    color: #EF4444;
  `}
  
  ${props => (!props.$trend || props.$trend === 'neutral') && `
    color: rgba(255, 255, 255, 0.9);
  `}
`;

const PerformanceBadge = styled.div<{ $improvement: number }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 0;
  font-size: 10px;
  font-weight: 700;
  font-family: 'Inconsolata', monospace;
  
  ${props => props.$improvement > 2.0 && `
    background: rgba(16, 185, 129, 0.2);
    color: #10B981;
  `}
  
  ${props => props.$improvement < 0.8 && `
    background: rgba(239, 68, 68, 0.2);
    color: #EF4444;
  `}
  
  ${props => props.$improvement >= 0.8 && props.$improvement <= 2.0 && `
    background: rgba(245, 158, 11, 0.2);
    color: #F59E0B;
  `}
`;

const TableContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const QueryCard = styled.div`
  display: flex;
  background: rgba(40, 40, 40, 1);
  border-radius: 0;
  overflow: hidden;
  transition: background-color 0.2s ease;
  margin-bottom: 8px;
  
  &:hover {
    background: rgba(45, 45, 45, 1);
  }
`;

const QuerySection = styled.div`
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  min-height: 200px;
`;

const QueryContentSection = styled(QuerySection)`
  background: rgba(35, 35, 35, 1);
`;

const QueryStatsSection = styled(QuerySection)`
  background: rgba(40, 40, 40, 1);
`;

const QueryActionsSection = styled(QuerySection)`
  background: rgba(45, 45, 45, 1);
  justify-content: center;
  align-items: center;
`;

const StatusTag = styled.div<{ $status: 'suggested' | 'applied' }>`
  display: inline-block;
  padding: 4px 8px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  margin-bottom: 8px;
  
  ${props => props.$status === 'suggested' && `
    background: rgba(59, 130, 246, 0.2);
    color: #3B82F6;
  `}
  
  ${props => props.$status === 'applied' && `
    background: rgba(16, 185, 129, 0.2);
    color: #10B981;
  `}
`;

const QueryIndex = styled.div`
  width: 20px;
  height: 32px;
  color: rgba(255, 255, 255, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
`;

const ActionGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
`;

const SuggestionContent = styled.div`
  background: rgba(20, 20, 20, 1);
  padding: 12px;
  margin-bottom: 12px;
  flex-grow: 1;
`;

const Block = styled.div`
  padding: 10px;
  background-color: rgba(45, 45, 45, 1);
  color: rgba(255, 255, 255, 0.9);
  
  & h1, & h2, & h3, & h4 {
    color: #fff;
  }
  
  & pre {
    background-color: rgba(30, 30, 30, 1);
    color: rgba(255, 255, 255, 0.9);
    padding: 10px;
  }
`;

const LoadingIndicator = styled.div`
  display: inline-block;
  animation: loading-indicator 1s infinite linear;
  @keyframes loading-indicator {
    0% { opacity: 0; }
    50% { opacity: 1; }
    100% { opacity: 0; }
  }
`;

const SuggestionsApplied = styled.div`
  color: rgba(100, 255, 100, 0.8);
  margin-bottom: 10px;
`;

const GlobalStats = styled.div`
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 10px;
  text-align: right;
`;

const StatTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
  display: inline-block;
  background-color: rgba(35, 35, 35, 1);
`;

const StatRow = styled.tr`
`;

const StatHeader = styled.th`
  text-align: left;
  color: rgba(255, 255, 255, 0.8);
`;

const StatCell = styled.td`
  color: rgba(255, 255, 255, 0.9);
`;

const formatNumber = (num: number) => {
  if (!num) return '?';
  return num > 10 ? Math.round(num).toLocaleString('en-US') : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function Query() {
  const { query_id } = useParams();
  const [queryData, setQueryData] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`/api/query/${query_id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then((response) => response.json())
      .then((data) => {
        console.log(data);
        setQueryData(data);
      });
  }, []);

  const getSuggestions = (query_id: string) => {
    fetch(`/api/suggest?query_id=${query_id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then((response) => response.json())
      .then((data) => {
        console.log(data);
        setQueryData(data);
      });
  };

  const instances = queryData && queryData.instances ? queryData.instances : [];

  return (
    <div>
      <h1>Query #{query_id}</h1>
      {queryData && (
        <>
          <QueryText $expanded={true}>{queryData.query}</QueryText>

          <h2>Stats</h2>
          <QueryStats>
            <QueryStat>Max execution time: {formatNumber(queryData.max_exec_time)}ms</QueryStat>
            <QueryStat>Min execution time: {formatNumber(queryData.min_exec_time)}ms</QueryStat>
            <QueryStat>Avg execution time: {formatNumber(queryData.avg_exec_time)}ms</QueryStat>
            <QueryStat>Number of executions: {queryData.num_instances}</QueryStat>
          </QueryStats>
          <h2>Individual runs</h2>
          <Block>
            {instances.map((instance, index) => (
              <div key={index}>{index}. Params: {instance.params}</div>
            ))}
          </Block>
          <h2>Query plan</h2>
          <Block>
            <pre>{instances ? instances[0].query_plan : ''}</pre>
          </Block>
          <h2>AI Suggestions</h2>
          <Block>
            {queryData.llm_response ? (
              <ReactMarkdown>{queryData.llm_response}</ReactMarkdown>
            ) : (
              <ActionButton $variant="primary" onClick={() => getSuggestions(queryData.query_id)}>🤖 Get suggestions</ActionButton>
            )}
          </Block>
          <h2>AI Suggested Indexes</h2>
          <Block>
            <pre>
              {queryData.suggested_indexes && queryData.suggested_indexes.trim()}
            </pre>
          </Block>
          <h2>AI Applied Indexes</h2>
          <Block>{queryData.applied_indexes ? queryData.applied_indexes : 'None'}</Block>
        </>
      )}
    </div>
  );
}

function AllQueries() {
  const [stats, setStats] = useState<any[]>([]);
  const [orderBy, setOrderBy] = useState<string>('avg_exec_time');
  const [orderDirection, setOrderDirection] = useState<'asc' | 'desc'>('desc');
  const [loadingSuggestions, setLoadingSuggestions] = useState<{ [key: string]: boolean }>({});
  const [rerunning, setRerunning] = useState<{ [key: string]: boolean }>({});
  const [expandedQueries, setExpandedQueries] = useState<{ [key: string]: boolean }>({});
  const navigate = useNavigate();

  const toggleQueryExpansion = (queryId: string) => {
    setExpandedQueries(prev => ({
      ...prev,
      [queryId]: !prev[queryId]
    }));
  };

  const order = (column: string) => {
    if (orderBy === column) {
      setOrderDirection(orderDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setOrderDirection('desc');
    }
    setOrderBy(column);
  };

  const getSuggestions = (query_id: string) => {
    if (loadingSuggestions[query_id]) {
      return;
    }
    setLoadingSuggestions(prev => ({ ...prev, [query_id]: true }));
    fetch(`/api/suggest?query_id=${query_id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then((response) => response.json())
      .then((data) => {
        console.log(data);
        setStats((prevStats) => {
          const newStats = [...prevStats];
          const index = newStats.findIndex((stat) => stat.query_id === query_id);
          newStats[index].llm_response = data.llm_response;
          newStats[index].suggested_indexes = data.suggested_indexes;
          newStats[index].applied_indexes = data.applied_indexes;
          return newStats;
        });
      })
      .finally(() => {
        setLoadingSuggestions(prev => ({ ...prev, [query_id]: false }));
      });
  };

  const applySuggestions = (query_id: string) => {
    if (loadingSuggestions[query_id]) {
      return;
    }
    setLoadingSuggestions(prev => ({ ...prev, [query_id]: true }));
    fetch(`/api/apply_suggestions?query_id=${query_id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          alert(data.error);
          return;
        }
        console.log(data);
        setStats((prevStats) => {
          const newStats = [...prevStats];
          const index = newStats.findIndex((stat) => stat.query_id === query_id);
          newStats[index].llm_response = data.llm_response;
          newStats[index].suggested_indexes = data.suggested_indexes;
          newStats[index].applied_indexes = data.applied_indexes;
          newStats[index].prev_exec_time = data.prev_exec_time;
          newStats[index].new_exec_time = data.new_exec_time;
          return newStats;
        });
      })
      .finally(() => {
        setLoadingSuggestions(prev => ({ ...prev, [query_id]: false }));
      });
  };

  const revertSuggestions = (query_id: string) => {
    if (loadingSuggestions[query_id]) {
      return;
    }
    setLoadingSuggestions(prev => ({ ...prev, [query_id]: true }));
    fetch(`/api/revert_suggestions?query_id=${query_id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then((response) => response.json())
      .then((data) => {
        console.log(data);
        setStats((prevStats) => {
          const newStats = [...prevStats];
          const index = newStats.findIndex((stat) => stat.query_id === query_id);
          newStats[index].llm_response = data.llm_response;
          newStats[index].suggested_indexes = data.suggested_indexes;
          newStats[index].applied_indexes = data.applied_indexes;
          newStats[index].prev_exec_time = data.prev_exec_time;
          newStats[index].new_exec_time = data.new_exec_time;
          newStats[index].last_exec_time = data.last_exec_time;
          return newStats;
        });
      })
      .finally(() => {
        setLoadingSuggestions(prev => ({ ...prev, [query_id]: false }));
      });
  };

  useEffect(() => {
    fetch('/api/all_queries?orderBy=' + orderBy + '&direction=' + orderDirection, {
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
  }, [orderBy, orderDirection]);

  const columns = stats[0] ? Object.keys(stats[0]) : [];

  // remove query_id from columns
  columns.splice(columns.indexOf('query_id'), 1);

  return (
    <div>
      <GlobalStats>
        {stats.length} unique queries captured {stats.reduce((acc, stat) => acc + stat.num_instances, 0)} times
      </GlobalStats>
      Sort by:
      <QuerySort>
        <QuerySortOption
          onClick={() => order('max_exec_time')}
          active={orderBy === 'max_exec_time' ? 'true' : undefined}
        >
          {orderBy === 'max_exec_time' && (orderDirection === 'asc' ? '▲' : '▼')} Max time
        </QuerySortOption>
        <QuerySortOption
          onClick={() => order('avg_exec_time')}
          active={orderBy === 'avg_exec_time' ? 'true' : undefined}
        >
          {orderBy === 'avg_exec_time' && (orderDirection === 'asc' ? '▲' : '▼')} Avg time
        </QuerySortOption>
        <QuerySortOption
          onClick={() => order('num_instances')}
          active={orderBy === 'num_instances' ? 'true' : undefined}
        >
          {orderBy === 'num_instances' && (orderDirection === 'asc' ? '▲' : '▼')} Run count
        </QuerySortOption>
        <QuerySortOption
          onClick={() => order('prev_exec_time/new_exec_time')}
          active={orderBy === 'prev_exec_time/new_exec_time' ? 'true' : undefined}
        >
          {orderBy === 'prev_exec_time/new_exec_time' && (orderDirection === 'asc' ? '▲' : '▼')} Improvements
        </QuerySortOption>
        <QuerySortOption
          onClick={() => order('total_time')}
          active={orderBy === 'total_time' ? 'true' : undefined}
        >
          {orderBy === 'total_time' && (orderDirection === 'asc' ? '▲' : '▼')} Total time
        </QuerySortOption>
      </QuerySort>

      <TableContainer>
        {stats.map((stat, index) => {
          const isExpanded = expandedQueries[stat.query_id];
          const hasPerformanceData = stat.new_exec_time && stat.prev_exec_time;
          const improvement = hasPerformanceData ? stat.prev_exec_time / stat.new_exec_time : 0;
          
          return (
            <QueryCard key={stat.query_id}>
              <QueryContentSection>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.4)', marginBottom: '8px' }}>
                  Query #{index + 1}
                </div>
                <QueryText 
                  $expanded={isExpanded}
                  onClick={() => toggleQueryExpansion(stat.query_id)}
                >
                  {stat.query}
                </QueryText>
              </QueryContentSection>
              
              <QueryStatsSection>
                <StatsGrid>
                  <StatItem>
                    <StatLabel>Executions</StatLabel>
                    <StatValue>{stat.num_instances}</StatValue>
                  </StatItem>
                  <StatItem>
                    <StatLabel>Avg Time</StatLabel>
                    <StatValue>{formatNumber(stat.avg_exec_time)}ms</StatValue>
                  </StatItem>
                  <StatItem>
                    <StatLabel>Max Time</StatLabel>
                    <StatValue>{formatNumber(stat.max_exec_time)}ms</StatValue>
                  </StatItem>
                  <StatItem>
                    <StatLabel>Last Time</StatLabel>
                    <StatValue>{formatNumber(stat.last_exec_time)}ms</StatValue>
                  </StatItem>
                </StatsGrid>
                
                {hasPerformanceData && (
                  <>
                    <StatItem>
                      <StatLabel>Performance</StatLabel>
                      <PerformanceBadge $improvement={improvement}>
                        {improvement > 2.0 ? '⬆' : improvement < 0.8 ? '⬇' : '→'} 
                        {formatNumber(improvement)}×
                      </PerformanceBadge>
                    </StatItem>
                    <StatsGrid>
                      <StatItem>
                        <StatLabel>Before</StatLabel>
                        <StatValue>{formatNumber(stat.prev_exec_time)}ms</StatValue>
                      </StatItem>
                      <StatItem>
                        <StatLabel>After</StatLabel>
                        <StatValue $trend={stat.new_exec_time < stat.prev_exec_time ? 'up' : 'down'}>
                          {formatNumber(stat.new_exec_time)}ms
                        </StatValue>
                      </StatItem>
                    </StatsGrid>
                  </>
                )}
                
                <ActionGroup style={{ marginTop: 'auto' }}>
                  <ActionButton 
                    $variant="secondary"
                    onClick={() => {
                      setRerunning(prev => ({ ...prev, [stat.query_id]: true }));
                      fetch(`/api/analyze_query?query_id=${stat.query_id}`)
                        .then(response => response.json())
                        .then(data => {
                          setStats(prevStats => {
                            const newStats = [...prevStats];
                            const index = newStats.findIndex((stat2) => stat2.query_id === stat.query_id);
                            newStats[index].prev_exec_time = data.prev_exec_time;
                            newStats[index].new_exec_time = data.new_exec_time;
                            newStats[index].last_exec_time = data.last_exec_time;
                            newStats[index].num_instances = data.num_instances;
                            return newStats;
                          });
                          setRerunning(prev => ({ ...prev, [stat.query_id]: false }));
                        });
                    }}
                    disabled={rerunning[stat.query_id]}
                  >
                    {rerunning[stat.query_id] ? (
                      <LoadingIndicator>Running...</LoadingIndicator>
                    ) : '🔄 Run'}
                  </ActionButton>
                  
                  <ActionButton 
                    $variant="secondary"
                    onClick={() => navigate(`/query/${stat.query_id}`)}
                  >
                    📋 Query plan
                  </ActionButton>
                </ActionGroup>
              </QueryStatsSection>
              
              <QueryActionsSection>
                {!stat.llm_response ? (
                  <ActionButton 
                    $variant="ai-suggestion"
                    onClick={() => getSuggestions(stat.query_id)}
                    disabled={loadingSuggestions[stat.query_id]}
                  >
                    {loadingSuggestions[stat.query_id] ? (
                      <LoadingIndicator>Getting suggestions...</LoadingIndicator>
                    ) : '🤖 Get AI Suggestions'}
                  </ActionButton>
                ) : (
                  <>
                    {stat.suggested_indexes && (
                      <>
                        <StatusTag $status={stat.applied_indexes ? 'applied' : 'suggested'}>
                          {stat.applied_indexes ? 'applied' : 'suggested'}
                        </StatusTag>
                        
                        <SuggestionContent>
                          <pre style={{ 
                            whiteSpace: 'pre-wrap', 
                            wordBreak: 'break-word',
                            margin: 0,
                            fontSize: '12px',
                            lineHeight: '1.4'
                          }}>
                            {stat.suggested_indexes.trim()}
                          </pre>
                        </SuggestionContent>
                        
                        <ActionGroup>
                          {!stat.applied_indexes && (
                            <>
                              <ActionButton 
                                $variant="secondary"
                                onClick={() => {
                                  setStats(prevStats => {
                                    const newStats = [...prevStats];
                                    const index = newStats.findIndex((stat2) => stat2.query_id === stat.query_id);
                                    newStats[index].llm_response = null;
                                    newStats[index].suggested_indexes = null;
                                    newStats[index].applied_indexes = null;
                                    newStats[index].prev_exec_time = null;
                                    newStats[index].new_exec_time = null;
                                    return newStats;
                                  });
                                  getSuggestions(stat.query_id);
                                }}
                              >
                                🔄 Ask again
                              </ActionButton>
                              
                              <ActionButton 
                                $variant="success"
                                onClick={() => applySuggestions(stat.query_id)}
                                disabled={loadingSuggestions[stat.query_id]}
                              >
                                {loadingSuggestions[stat.query_id] ? (
                                  <LoadingIndicator>Applying...</LoadingIndicator>
                                ) : `⬇ Apply Index${stat.suggested_indexes.trim().split(';').filter(line => line.trim()).length > 1 ? 'es' : ''}`}
                              </ActionButton>
                            </>
                          )}
                          
                          {stat.applied_indexes && (
                            <ActionButton 
                              $variant="danger"
                              onClick={() => revertSuggestions(stat.query_id)}
                              disabled={loadingSuggestions[stat.query_id]}
                            >
                              {loadingSuggestions[stat.query_id] ? (
                                <LoadingIndicator>Reverting...</LoadingIndicator>
                              ) : '⬆ Revert'}
                            </ActionButton>
                          )}
                        </ActionGroup>
                      </>
                    )}
                  </>
                )}
              </QueryActionsSection>
            </QueryCard>
          );
        })}
      </TableContainer>
    </div>
  );
}

function AllAppliedIndexes() {
  const [indexes, setIndexes] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/get_all_applied_indexes', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then((response) => response.json())
      .then((data) => {
        setIndexes(data);
      });
  }, []);

  return (
    <div>
      <h1>Applied Indexes</h1>
      <Block>
        <ActionButton $variant="danger" onClick={async () => {
          fetch('/api/revert_all_suggestions').then(response => response.json()).then(data => {
            setIndexes(data);
          });
        }}>Revert All Suggestions</ActionButton>
      </Block>
      <Block>
        <Table>
          <tbody>
            {indexes.map((indexData: any, index) => (
              <TableRow key={index}>
                <TableData>{indexData.index_name}</TableData>
                <TableData>{indexData.table_name}</TableData>
                <TableData>{indexData.column_name}</TableData>
                <TableData>{indexData.is_unique ? 'UNIQUE' : 'NON-UNIQUE'}</TableData>
                <TableData>{indexData.is_primary ? 'PRIMARY' : 'NON-PRIMARY'}</TableData>
                <TableData>{indexData.index_definition}</TableData>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Block>
    </div>
  );
}

function Home() {
  const { args } = useContext(AppContext);

  return <div>
    <h1>Instructions</h1>
    {args && (
      <>
        <p>dbpill is running on port {args.proxyPort}. Change your app's PostgreSQL connection to port {args.proxyPort} to start intercepting queries.</p>
        <p>Then go to Queries tab.</p>
        <p>You can reset all dbpill-triggered changes from Indexes tab.</p>
      </>
    )}

  </div>;
}

function App(mainProps: MainProps) {
  const { args } = mainProps;

  useEffect(() => {
    const socket = io();
    socket.on('connect', () => {
      console.log('connected to socket.io');
    });

    return () => {
      socket.disconnect();
    }
  }, []);

  return (
    <AppContext.Provider value={{ args }}>
      <Router>
        <Container>
          <NavBar>
            <TextLogo>dbpill</TextLogo>
            <StyledNavLink to="/" className={location.pathname === '/' ? 'active' : ''}>Home</StyledNavLink>
            <StyledNavLink to="/queries">Queries</StyledNavLink>
            <StyledNavLink to="/indexes">Indexes</StyledNavLink>
          </NavBar>
          <MainContent>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/queries" element={<AllQueries />} />
              <Route path="/query/:query_id" element={<Query />} />
              <Route path="/indexes" element={<AllAppliedIndexes />} />
            </Routes>
          </MainContent>
        </Container>
      </Router>
    </AppContext.Provider>
  );
}

export default App;
