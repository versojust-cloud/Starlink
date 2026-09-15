/**
 * Registry-contract test for the deep-research agent.
 *
 * Imports the graph module so its top-level `ready` IIFE registers the
 * descriptor in the singleton agent registry, then asserts the descriptor
 * is present with the expected role and capability shape.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { agentRegistry } from '../../capabilities/index.js'
import { ready } from './graph.js'

test('deep-research agent registers in the registry as a generator with reflect/single_round capability', async () => {
  await ready
  assert.equal(agentRegistry.has('deep-research'), true)
  const descriptor = agentRegistry.get('deep-research')
  assert.ok(descriptor)
  assert.equal(descriptor.id, 'deep-research')
  assert.equal(descriptor.role, 'generator')
  assert.ok(Array.isArray(descriptor.capabilities))
  const reflect = descriptor.capabilities.find((c) => c.kind === 'reflect')
  assert.ok(reflect, 'expected a reflect capability')
  if (reflect && reflect.kind === 'reflect') {
    assert.equal(reflect.scope, 'single_round')
  }
})

test('deep-research subgraph factory returns a compiled graph (lazy)', async () => {
  await ready
  const descriptor = agentRegistry.get('deep-research')
  assert.ok(descriptor)
  const subgraph = descriptor.buildSubgraph()
  // Compiled LangGraph subgraphs expose .invoke / .stream — we only need to
  // verify the factory returns a non-null object that smells right.
  assert.ok(subgraph && typeof subgraph === 'object')
  assert.equal(typeof (subgraph as { invoke?: unknown }).invoke, 'function')
})
