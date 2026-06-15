import React from 'react';
import SidepanelView from './sidepanel';

/**
 * Variant Handler App Entry
 * Focuses 100% of the application viewport on the stateful, persistent right sidepanel companion
 * designed to assist clinical scientists with diagnostics, batch processing, and annotation.
 */
export default function App() {
  return (
    <div 
      id="sidepanel-host-environment" 
      className="min-h-screen w-full bg-slate-950 flex justify-center items-stretch overflow-hidden"
    >
      <div className="w-full max-w-lg bg-slate-900 shadow-2xl border-x border-slate-800/60 flex flex-col h-screen">
        <SidepanelView />
      </div>
    </div>
  );
}
