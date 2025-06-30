import { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import styled from 'styled-components';

import {
  QuerySort,
  QuerySortOption,
  TableContainer,
  QueryCard,
  QueryContentSection,
  QueryText,
  QueryStatsSection,
  PerformanceBadge,
  ActionGroup,
  ActionButton,
  QueryActionsSection,
  StatusTag,
  SuggestionContent,
  HighlightedSQL,
  LoadingIndicator,
  StatsTable,
  StatsTableBody,
  StatsTableRow,
  StatsTableLabelCell,
  StatsTableValueCell,
  StatsTableActionCell,
  StatsTableImprovementCell,
  SuggestionTitleBar,
  SuggestionTitleGroup,
  SuggestionActionGroup,
  SuggestionContainer,
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
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
`;

const StatsText = styled.div`
  color: rgba(255, 255, 255, 0.7);
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
  const [resetting, setResetting] = useState<boolean>(false);
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

  const handleReset = async () => {
    if (!confirm('Are you sure you want to clear all query logs? This action cannot be undone.')) {
      return;
    }
    
    setResetting(true);
    try {
      const response = await fetch('/api/reset_query_logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        setStats([]);
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to reset query logs');
      }
    } catch (error) {
      console.error('Error resetting query logs:', error);
      alert('Failed to reset query logs');
    } finally {
      setResetting(false);
    }
  };

  const handleRerun = (queryId: string) => {
    setRerunning(prev => ({ ...prev, [queryId]: true }));
    fetch(`/api/analyze_query?query_id=${queryId}`)
      .then(response => response.json())
      .then(data => {
        setStats(prevStats => {
          const newStats = [...prevStats];
          const idx = newStats.findIndex(s => s.query_id === parseInt(queryId));
          if (idx !== -1) newStats[idx] = { ...newStats[idx], ...data };
          return newStats;
        });
        setRerunning(prev => ({ ...prev, [queryId]: false }));
      });
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
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to get AI suggestions');
        }
        return data;
      })
      .then((data) => {
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
      })
      .catch((err) => {
        alert(err.message);
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
      })
      .finally(() => {
        setLoadingSuggestions(prev => ({ ...prev, [query_id]: false }));
      });
  };

  useEffect(() => {
    fetch(`/api/all_queries?orderBy=${orderBy}&direction=${orderDirection}`, {
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
  if (columns.includes('query_id')) {
    columns.splice(columns.indexOf('query_id'), 1);
  }

  // Show instructions if no queries are available
  if (stats.length === 0) {
    return (
      <InstructionsContainer>
        <h1>Instructions</h1>
        {args && (
          <>
            <p>
              dbpill is running on port {args.proxyPort}. Change your app's PostgreSQL
              connection to port {args.proxyPort} to start intercepting queries.
            </p>
            <p>Once you start running queries through dbpill, they will appear here for analysis and optimization.</p>
            <p>You can reset all dbpill-triggered changes from the Config tab.</p>
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
        <ActionButton
          $variant="danger"
          onClick={handleReset}
          disabled={resetting}
          style={{ padding: '4px 8px', fontSize: '12px' }}
        >
          {resetting ? <LoadingIndicator>Resetting...</LoadingIndicator> : 'Reset all ⌫'}
        </ActionButton>
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
                    {rerunning[stat.query_id] ? <LoadingIndicator>Running...</LoadingIndicator> : '↻ Run again'}
                  </ActionButton>
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
                      ) : (
                        '🤖 Get AI Suggestions'
                      )}
                    </ActionButton>
                  ) : (
                    <>
                      {stat.suggested_indexes && (
                        <SuggestionContainer>
                          <SuggestionTitleBar $status={stat.applied_indexes ? 'applied' : 'suggested'}>
                            <SuggestionTitleGroup>
                              <StatusTag $status={stat.applied_indexes ? 'applied' : 'suggested'}>
                                {stat.applied_indexes ? 'Applied' : 'Suggested'}
                              </StatusTag>
                            </SuggestionTitleGroup>

                            <SuggestionActionGroup>
                              {!stat.applied_indexes && (
                                <ActionButton
                                  $variant="secondary"
                                  onClick={() => {
                                    setStats(prevStats => {
                                      const newStats = [...prevStats];
                                      const index = newStats.findIndex(stat2 => stat2.query_id === stat.query_id);
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
                                  ↻ Ask again
                                </ActionButton>
                              )}
                              {!stat.applied_indexes && (
                                <ActionButton
                                  $variant="success"
                                  onClick={() => applySuggestions(stat.query_id)}
                                  disabled={loadingSuggestions[stat.query_id]}
                                >
                                  {loadingSuggestions[stat.query_id] ? (
                                    <LoadingIndicator>Applying...</LoadingIndicator>
                                  ) : (
                                    `⬇ Apply Index${stat.suggested_indexes.trim().split(';').filter(line => line.trim()).length > 1 ? 'es' : ''}`
                                  )}
                                </ActionButton>
                              )}

                              {stat.applied_indexes && (
                                <ActionButton
                                  $variant="danger"
                                  onClick={() => revertSuggestions(stat.query_id)}
                                  disabled={loadingSuggestions[stat.query_id]}
                                >
                                  {loadingSuggestions[stat.query_id] ? (
                                    <LoadingIndicator>Reverting...</LoadingIndicator>
                                  ) : (
                                    '⬆ Revert'
                                  )}
                                </ActionButton>
                              )}
                            </SuggestionActionGroup>
                          </SuggestionTitleBar>

                          <SuggestionContent $status={stat.applied_indexes ? 'applied' : 'suggested'}>
                            <HighlightedSQL>
                              {highlightSQL(stat.suggested_indexes.trim())}
                            </HighlightedSQL>
                          </SuggestionContent>

                          {hasPerformanceData && (
                            <StatsTable>
                              <StatsTableBody>
                                <StatsTableRow>
                                  <StatsTableLabelCell>Before</StatsTableLabelCell>
                                  <StatsTableValueCell>{formatNumber(stat.prev_exec_time)} <NumUnit>ms</NumUnit></StatsTableValueCell>
                                  <StatsTableImprovementCell rowSpan={2}>
                                    <PerformanceBadge $improvement={improvement}>
                                      {improvement > 2.0 ? '⬆' : improvement < 0.8 ? '⬇' : ''} {formatNumber(improvement)}× improvement
                                    </PerformanceBadge>
                                  </StatsTableImprovementCell>
                                </StatsTableRow>
                                <StatsTableRow>
                                  <StatsTableLabelCell>After</StatsTableLabelCell>
                                  <StatsTableValueCell>
                                    {formatNumber(stat.new_exec_time)} <NumUnit>ms</NumUnit>
                                  </StatsTableValueCell>
                                </StatsTableRow>
                              </StatsTableBody>
                            </StatsTable>
                          )}
                        </SuggestionContainer>
                      )}
                    </>
                  )}
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