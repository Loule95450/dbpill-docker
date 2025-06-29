import { useEffect, useState } from 'react';

import { Table, TableRow, TableData, Block, ActionButton } from '../styles/Styled';

export function AppliedIndexes() {
  const [indexes, setIndexes] = useState<any[]>([]);

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
        <ActionButton
          $variant="danger"
          onClick={() => {
            fetch('/api/revert_all_suggestions')
              .then((response) => response.json())
              .then((data) => {
                setIndexes(data);
              });
          }}
        >
          Revert All Suggestions
        </ActionButton>
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