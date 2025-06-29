import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';

import {
  QueryText,
  QueryStats,
  QueryStat,
  Block,
  ActionButton,
  HighlightedSQL,
} from '../styles/Styled';

import { formatNumber } from '../utils/formatNumber';
import { highlightSQL } from '../utils/sqlHighlighter';

function QueryDetailInternal() {
  const { query_id } = useParams();
  const [queryData, setQueryData] = useState<any>(null);

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
          <QueryText $expanded>{highlightSQL(queryData.query)}</QueryText>

          <h2>Stats</h2>
          <QueryStats>
            <QueryStat>
              Max execution time: {formatNumber(queryData.max_exec_time)}ms
            </QueryStat>
            <QueryStat>
              Min execution time: {formatNumber(queryData.min_exec_time)}ms
            </QueryStat>
            <QueryStat>
              Avg execution time: {formatNumber(queryData.avg_exec_time)}ms
            </QueryStat>
            <QueryStat>
              Number of executions: {queryData.num_instances}
            </QueryStat>
          </QueryStats>
          <h2>Individual runs</h2>
          <Block>
            {instances.map((instance, index) => (
              <div key={index}>
                {index}. Params: {instance.params}
              </div>
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
              <ActionButton
                $variant="primary"
                onClick={() => getSuggestions(queryData.query_id)}
              >
                🤖 Get suggestions
              </ActionButton>
            )}
          </Block>
          <h2>AI Suggested Indexes</h2>
          <Block>
            {queryData.suggested_indexes ? (
              <HighlightedSQL>{highlightSQL(queryData.suggested_indexes.trim())}</HighlightedSQL>
            ) : (
              <span>None</span>
            )}
          </Block>
          <h2>AI Applied Indexes</h2>
          <Block>
            {queryData.applied_indexes ? (
              <HighlightedSQL>{highlightSQL(queryData.applied_indexes)}</HighlightedSQL>
            ) : (
              <span>None</span>
            )}
          </Block>
        </>
      )}
    </div>
  );
}

export const QueryDetail = QueryDetailInternal; 