import { useContext } from 'react';
import { AppContext } from '../context/AppContext';

export function Home() {
  const { args } = useContext(AppContext);

  return (
    <div>
      <h1>Instructions</h1>
      {args && (
        <>
          <p>
            dbpill is running on port {args.proxyPort}. Change your app's PostgreSQL
            connection to port {args.proxyPort} to start intercepting queries.
          </p>
          <p>Then go to Queries tab.</p>
          <p>You can reset all dbpill-triggered changes from Indexes tab.</p>
        </>
      )}
    </div>
  );
} 