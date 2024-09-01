import { useState, useEffect } from 'react';
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

const Container = styled.div`
  font-family: monospace;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: auto;
  background-color: #eee;
  color: #4a4a4a;
`;

const TextLogo = styled.div`
  font-size: 1.5em;
  font-weight: bold;
  color: #fff;
`;

const NavBar = styled.div`
  display: flex;
  gap: 10px;
  padding: 10px;
  background-color: #000;
`;

const StyledNavLink = styled(RouterNavLink)`
  cursor: pointer;
  text-decoration: none;
  padding: 0 5px;
  line-height: 20px;
  height: 20px;

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
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
  background-color: #fff;
`;

const TableRow = styled.tr`
  background-color: rgba(0, 0, 0, 0.01);
  &:nth-child(even) {
    background-color: rgba(0, 0, 0, 0.03);
  }
`;

const TableHeader = styled.th`
  padding: 12px;
  text-align: left;
  border: 1px solid #d2b48c;
  background-color: #deb887;
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
`;

const QueryStats = styled.div`
  display: flex;
  flex-direction: column;
  text-align: left;
`;

const QueryStat = styled.div`
  padding: 0 2px 2px 2px;
`;

const PerformanceStat = styled(QueryStat)<{ mode?: 'up' | 'down' }>`
  color: ${(props) => props.mode === undefined ? '#333' : props.mode === 'up' ? '#00aa44' : '#cc0000'};
  font-size: ${(props) => props.mode === undefined ? '1em' : props.mode === 'up' ? '1.2em' : '1.2em'};
  line-height: 1.2em;
`;

const QueryText = styled.pre<{ $expanded?: boolean }>`
  text-align: left;
  white-space: pre-wrap;
  max-height: 200px;
  overflow: auto;
  padding: 10px;
  margin: -10px;
  display: block;
  border-right: 1px solid rgba(0, 0, 0, 0.03);
  
  ${props => !props.$expanded && `
    cursor: pointer;
    &:hover {
      outline: 1px solid #000;
    }
  `}

  ${props => props.$expanded && `
    max-height: none;
  `}
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
  border-bottom: 1px solid #000;

  &:hover {
    box-shadow: 0 2px 0 0 #00000077;
  }

  ${props => props.active == 'true' && `
    box-shadow: 0 2px 0 0 #000;
  `}
`;

const RowIndex = styled.span`
  opacity: 0.2;
  font-size: 1.2em;
`;

const ActionButton = styled.button<{ type?: 'main' | 'secondary' | 'revert' }>`
  padding: 5px 10px;
  font-family: monospace;
  background-color: #444;
  color: #fff;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  line-height: 20px;
  margin-right: 10px;
    box-shadow: 0 2px 0 0 rgba(0, 0, 0, 0.03);

  ${props => props.type == 'main' && `
    background-color: #00aa44;
    color: #fff;
  `}

  ${props => props.type == 'revert' && `
    background-color: #fff;
    color: #a00;
  `}

  ${props => props.type == 'secondary' && `
    background-color: #fff;
    color: #444;
  `}

  &:hover {
    box-shadow: 0 2px 0 0 rgba(0, 0, 0, 0.3);
  }
`;

const Block = styled.div`
  padding: 10px;
  background-color: #fff;
  border-radius: 5px;
`;

const IndexSuggestions = styled.div`
   & h4 {
    margin-top: 0;
    padding-top: 0;
    margin-bottom: 10px;
    opacity: 0.5;
    font-weight: normal;
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
  color: rgba(0, 30, 0, 0.5);
  margin-bottom: 10px;
`;

const GlobalStats = styled.div`
  color: rgba(0, 30, 0, 0.5);
  margin-bottom: 10px;
  text-align: right;
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
              <ActionButton onClick={() => getSuggestions(queryData.query_id)}>🤖 Get suggestions</ActionButton>
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
  const navigate = useNavigate();

  const order = (column: string) => {
    if (orderBy === column) {
      setOrderDirection(orderDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setOrderDirection('desc');
    }
    setOrderBy(column);
  };

  const getSuggestions = (query_id: string) => {
    if(loadingSuggestions[query_id]) {
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
    if(loadingSuggestions[query_id]) {
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
    if(loadingSuggestions[query_id]) {
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
          {orderBy === 'max_exec_time' && (orderDirection === 'asc' ? '▲' : '▼')} Max Execution Time
        </QuerySortOption>
        <QuerySortOption 
          onClick={() => order('min_exec_time')} 
          active={orderBy === 'min_exec_time' ? 'true' : undefined}
        >
          {orderBy === 'min_exec_time' && (orderDirection === 'asc' ? '▲' : '▼')} Min Execution Time
        </QuerySortOption>
        <QuerySortOption 
          onClick={() => order('avg_exec_time')} 
          active={orderBy === 'avg_exec_time' ? 'true' : undefined}
        >
          {orderBy === 'avg_exec_time' && (orderDirection === 'asc' ? '▲' : '▼')} Avg Execution Time
        </QuerySortOption>
        <QuerySortOption 
          onClick={() => order('num_instances')} 
          active={orderBy === 'num_instances' ? 'true' : undefined}
        >
          {orderBy === 'num_instances' && (orderDirection === 'asc' ? '▲' : '▼')} Number of Executions
        </QuerySortOption>
      </QuerySort>

      <Table>
        <tbody>
          {stats.map((stat, index) => {
            return (
              <TableRow key={stat.query_id}>
                <TableData>
                  <RowIndex>{index + 1}</RowIndex>
                  {/* <QueryOptionsButton>▼</QueryOptionsButton> */} 
                  <div onClick={async () => {
                    await fetch(`/api/ignore_query?query_id=${stat.query_id}`).then(response => response.json()).then(data => {
                      setStats(prevStats => {
                        const newStats = [...prevStats.filter(stat2 => stat2.query_id !== stat.query_id)];
                        return newStats;
                      });
                    });
                  }}></div>
                </TableData>
                <TableData>
                  <QueryText onClick={() => navigate(`/query/${stat.query_id}`)}>
                    {stat.query.split('\n')[0]}
                    <span style={{filter: "blur(4px)"}}>{stat.query.split('\n').slice(1).join('\n')}</span>
                  </QueryText>
                </TableData>
                <TableData>
                  <QueryStats>
                    <QueryStat>Max execution time: {formatNumber(stat.max_exec_time)}ms</QueryStat>
                    <QueryStat>Min execution time: {formatNumber(stat.min_exec_time)}ms</QueryStat>
                    <QueryStat>Avg execution time: {formatNumber(stat.avg_exec_time)}ms</QueryStat>
                    <QueryStat>Last execution time: {formatNumber(stat.last_exec_time)}ms</QueryStat>
                    <QueryStat>Number of executions: {stat.num_instances}</QueryStat>
                  </QueryStats>
                  <br />
                  <ActionButton type="secondary" onClick={() => {
                    setRerunning(prev => ({ ...prev, [stat.query_id]: true }));
                    fetch(`/api/analyze_query?query_id=${stat.query_id}`).then(response => response.json()).then(data => {
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
                  }}>
                    {rerunning[stat.query_id] ? (
                      <LoadingIndicator>Running...</LoadingIndicator>
                    ) : '🔄 Re-run'}
                  </ActionButton>
                  {stat.new_exec_time && (
                    <QueryStats>
                      <br />
                      <PerformanceStat>New execution time: {formatNumber(stat.new_exec_time)}ms</PerformanceStat>
                      <PerformanceStat mode={stat.new_exec_time < stat.last_exec_time ? 'up' : 'down'}>Performance: {stat.new_exec_time < stat.last_exec_time ? '⬆' : '⬇'}{formatNumber(stat.avg_exec_time / stat.new_exec_time)}⨉ </PerformanceStat>
                    </QueryStats>
                  )}
                </TableData>
                <TableData>
                  <IndexSuggestions>
                    <h4>AI Suggested Indexes</h4>
                    {!stat.llm_response ? (
                      <ActionButton onClick={() => getSuggestions(stat.query_id)}>
                        {loadingSuggestions[stat.query_id] ? (
                          <LoadingIndicator>Getting suggestions...</LoadingIndicator>
                        ) : '🤖 Get suggestions'}
                      </ActionButton>
                    ) : (
                      <>
                        {stat.suggested_indexes && (
                          <div>
                            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word'}}>
                              {stat.suggested_indexes.trim().slice(0, 20)}
                              <span style={{filter: "blur(3px)"}}>{stat.suggested_indexes.trim().slice(20)}</span>
                            </pre>
                          </div>
                        )}
                        {stat.suggested_indexes && !stat.applied_indexes && (
                          <>
                          <ActionButton type="secondary" onClick={() => {
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
                          }}>
                            🔄
                          </ActionButton>
                            <ActionButton type="main" onClick={() => applySuggestions(stat.query_id)}>
                              {loadingSuggestions[stat.query_id] ? (
                                <LoadingIndicator>Applying suggestions...</LoadingIndicator>
                              ) : '⏬ Apply index suggestions'}
                            </ActionButton>
                          </>
                        )}
                        {stat.applied_indexes && (
                          <>
                            <SuggestionsApplied>✅ Suggestions already applied</SuggestionsApplied>
                            <ActionButton type="revert" onClick={() => revertSuggestions(stat.query_id)}>
                              {loadingSuggestions[stat.query_id] ? (
                                <LoadingIndicator>Reverting indexes...</LoadingIndicator>
                              ) : '⏫ Revert'}
                            </ActionButton>
                          </>
                        )}
                      </>
                    )}
                    </IndexSuggestions>
                  </TableData>
              </TableRow>

            );
          })}
        </tbody>
      </Table>
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
        <ActionButton onClick={async () => {
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
      // setCount(data.counter);
    });

    return () => {
      socket.disconnect();
    }
  }, []);

  return (
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
  );
}

export default App;
