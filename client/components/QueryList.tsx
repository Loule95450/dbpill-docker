import { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import { queryApi } from '../utils/HttpApi';
import styled from 'styled-components';
import { QuerySuggestions } from './QuerySuggestions';
import dbpillDiagram from '../assets/dbpill_diagram.svg';

import {
  QuerySort,
  QuerySortOption,
  TableContainer,
  QueryCard,
  QueryContentSection,
  QueryText,
  QueryStatsSection,
  ActionButton,
  QueryActionsSection,
  LoadingIndicator,
  StatsTable,
  StatsTableBody,
  StatsTableRow,
  StatsTableLabelCell,
  StatsTableValueCell,
  NumUnit,
} from '../styles/Styled';

import { QueryDetailsBar } from './QueryDetailsBar';

import { formatNumber } from '../utils/formatNumber';
import { highlightSQL } from '../utils/sqlHighlighter';

// --- Local styled components for the new bottom tab bar redesign ---

const CardWrapper = styled.div`
  display: flex;
  flex-direction: column;
`;

const StatsHeader = styled.div`
  margin-bottom: 10px;
  padding-left: 5px;
`;

const StatsText = styled.div`
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
`;

const InstructionsContainer = styled.div`
  max-width: 600px;
  margin: 0 auto;
  line-height: 1.6;
  
  h1 {
    margin-bottom: 20px;
    color: color(display-p3 0.964 0.7613 0.3253);
  }
  
  p {
    margin-bottom: 15px;
    color: rgba(255, 255, 255, 0.9);
  }
`;

export function QueryList() {
  const [stats, setStats] = useState<any[]>([]);
  const [orderBy, setOrderBy] = useState<string>('avg_exec_time');
  const [orderDirection, setOrderDirection] = useState<'asc' | 'desc'>('desc');
  const [loadingSuggestions, setLoadingSuggestions] = useState<{ [key: string]: boolean }>({});
  const [rerunning, setRerunning] = useState<{ [key: string]: boolean }>({});
  const [expandedQueries, setExpandedQueries] = useState<{ [key: string]: boolean }>({});
  const navigate = useNavigate();
  const { args } = useContext(AppContext);

  const toggleQueryExpansion = (queryId: string) => {
    setExpandedQueries(prev => ({
      ...prev,
      [queryId]: !prev[queryId],
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

  const handleRerun = async (queryId: string) => {
    setRerunning(prev => ({ ...prev, [queryId]: true }));
    try {
      const data = await queryApi.analyzeQuery(queryId);
      setStats(prevStats => {
        const newStats = [...prevStats];
        const idx = newStats.findIndex(s => s.query_id === parseInt(queryId));
        if (idx !== -1) newStats[idx] = { ...newStats[idx], ...data };
        return newStats;
      });
    } catch (error) {
      console.error('Error rerunning query:', error);
    } finally {
      setRerunning(prev => ({ ...prev, [queryId]: false }));
    }
  };

  const getSuggestions = async (query_id: string) => {
    if (loadingSuggestions[query_id]) {
      return;
    }

    // Find any custom prompt stored in the current stats array for this query
    const currentStat = stats.find((s) => s.query_id === parseInt(query_id));
    const promptOverride = currentStat?.prompt_preview;

    setLoadingSuggestions(prev => ({ ...prev, [query_id]: true }));
    try {
      const data = await queryApi.getSuggestions(query_id, promptOverride);
      setStats((prevStats) => {
        const newStats = [...prevStats];
        const index = newStats.findIndex((stat) => stat.query_id === parseInt(query_id));
        if (index !== -1) {
          newStats[index] = {
            ...newStats[index],
            ...data,
          };
        }
        return newStats;
      });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoadingSuggestions(prev => ({ ...prev, [query_id]: false }));
    }
  };



  useEffect(() => {
    const loadQueries = async () => {
      try {
        const data = await queryApi.getAllQueries(orderBy, orderDirection);
        setStats(data.stats);
        setOrderBy(data.orderBy);
        setOrderDirection(data.orderDirection as 'asc' | 'desc');
      } catch (error) {
        console.error('Error loading queries:', error);
      }
    };
    
    loadQueries();
  }, [orderBy, orderDirection]);

  const columns = stats[0] ? Object.keys(stats[0]) : [];
  if (columns.includes('query_id')) {
    columns.splice(columns.indexOf('query_id'), 1);
  }

  const dbUrl = new URL(args.db);
  const dbUser = dbUrl.username;
  const dbName = dbUrl.pathname.replace(/^\/+/, '');

  // Show instructions if no queries are available
  if (stats.length === 0) {
    return (
      <InstructionsContainer>
        <h1>Instructions</h1>
        {args && (
          <>
            <p style={{color: '#fff', fontSize: '18px', background: 'rgba(255, 255, 255, 0.1)', padding: '5px 10px', borderRadius: '5px'}}>
              dbpill is running on port <span style={{color: '#fff4a7'}}>{args.proxyPort}</span><br /> → <span style={{color: '#fff4a7'}}>postgresql://{dbUser}@localhost:{args.proxyPort}/{dbName}</span>
            </p>
            <p>
              Change your app's PostgreSQL connection to port {args.proxyPort} to start intercepting queries.
            </p>
            <p>Once you start using your app &amp; running queries through dbpill, they will appear here for analysis and optimization.</p>
            <img style={{width: '100%', height: 'auto'}} src={dbpillDiagram} alt="dbpill workflow diagram" />
          </>
        )}
      </InstructionsContainer>
    );
  }

  return (
    <div>
      <StatsHeader>
        <StatsText>
          {stats.length} unique queries captured{' '}
          {stats.reduce((acc, stat) => acc + stat.num_instances, 0)} times
        </StatsText>
      </StatsHeader>
      <QuerySort>

        <QuerySortOption
          onClick={() => order('avg_exec_time')}
          $active={orderBy === 'avg_exec_time' ? 'true' : undefined}
        >
          {orderBy === 'avg_exec_time' && (orderDirection === 'asc' ? '▲' : '▼')} Avg time
        </QuerySortOption>
        <QuerySortOption
          onClick={() => order('total_time')}
          $active={orderBy === 'total_time' ? 'true' : undefined}
        >
          {orderBy === 'total_time' && (orderDirection === 'asc' ? '▲' : '▼')} Total time
        </QuerySortOption>

        <QuerySortOption
          onClick={() => order('max_exec_time')}
          $active={orderBy === 'max_exec_time' ? 'true' : undefined}
        >
          {orderBy === 'max_exec_time' && (orderDirection === 'asc' ? '▲' : '▼')} Max time
        </QuerySortOption>
        <QuerySortOption
          onClick={() => order('num_instances')}
          $active={orderBy === 'num_instances' ? 'true' : undefined}
        >
          {orderBy === 'num_instances' && (orderDirection === 'asc' ? '▲' : '▼')} Run count
        </QuerySortOption>
        <QuerySortOption
          onClick={() => order('prev_exec_time/new_exec_time')}
          $active={orderBy === 'prev_exec_time/new_exec_time' ? 'true' : undefined}
        >
          {orderBy === 'prev_exec_time/new_exec_time' && (orderDirection === 'asc' ? '▲' : '▼')} Improvements
        </QuerySortOption>
      </QuerySort>

      <TableContainer>
        {stats.map((stat, index) => {
          const isExpanded = expandedQueries[stat.query_id];
          const hasPerformanceData = stat.new_exec_time && stat.prev_exec_time;
          const improvement = hasPerformanceData ? stat.prev_exec_time / stat.new_exec_time : 0;

          return (
            <CardWrapper key={stat.query_id}>
              <QueryCard>
                <QueryContentSection>
                  <QueryText $expanded={isExpanded} onClick={() => toggleQueryExpansion(stat.query_id)}>
                    {highlightSQL(stat.query)}
                  </QueryText>
                </QueryContentSection>

                <QueryStatsSection>
                  <StatsTable>
                    <StatsTableBody>
                      <StatsTableRow>
                        <StatsTableLabelCell>Total</StatsTableLabelCell>
                        <StatsTableValueCell colSpan={2}>
                          {formatNumber(stat.total_time)} <NumUnit>ms</NumUnit> <NumUnit>from</NumUnit> {stat.num_instances} <NumUnit>{stat.num_instances === 1 ? 'run' : 'runs'}</NumUnit>
                        </StatsTableValueCell>
                      </StatsTableRow>
                      <StatsTableRow>
                        <StatsTableLabelCell>Avg</StatsTableLabelCell>
                        <StatsTableValueCell colSpan={2}>{formatNumber(stat.avg_exec_time)} <NumUnit>ms</NumUnit></StatsTableValueCell>
                      </StatsTableRow>
                      <StatsTableRow>
                        <StatsTableLabelCell>Min</StatsTableLabelCell>
                        <StatsTableValueCell colSpan={2}>{formatNumber(stat.min_exec_time)} <NumUnit>ms</NumUnit></StatsTableValueCell>
                      </StatsTableRow>
                      <StatsTableRow>
                        <StatsTableLabelCell>Max</StatsTableLabelCell>
                        <StatsTableValueCell colSpan={2}>{formatNumber(stat.max_exec_time)} <NumUnit>ms</NumUnit></StatsTableValueCell>
                      </StatsTableRow>
                      <StatsTableRow>
                        <StatsTableLabelCell>Last</StatsTableLabelCell>
                        <StatsTableValueCell colSpan={2}>{formatNumber(stat.last_exec_time)} <NumUnit>ms</NumUnit></StatsTableValueCell>
                      </StatsTableRow>
                    </StatsTableBody>
                  </StatsTable>

                  <ActionButton
                    $variant="secondary"
                    onClick={() => handleRerun(stat.query_id.toString())}
                    disabled={rerunning[stat.query_id]}
                    style={{ marginTop: '8px', alignSelf: 'flex-start' }}
                  >
                    {rerunning[stat.query_id] ? <LoadingIndicator>Running...</LoadingIndicator> : (
                      <>
                        ↻ Run again <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}>with random params</span>
                      </>
                    )}
                  </ActionButton>
                </QueryStatsSection>

                <QueryActionsSection>
                  <QuerySuggestions
                    stat={stat}
                    loadingSuggestions={loadingSuggestions}
                    setLoadingSuggestions={setLoadingSuggestions}
                    setStats={setStats}
                    getSuggestions={getSuggestions}
                  />
                </QueryActionsSection>
              </QueryCard>

              <QueryDetailsBar
                queryId={stat.query_id}
                hasLlmResponse={!!stat.llm_response}
                setStats={setStats}
                stat={stat}
              />
            </CardWrapper>
          );
        })}
      </TableContainer>
    </div>
  );
} 