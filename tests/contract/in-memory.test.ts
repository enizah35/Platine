import { createInMemoryRepositories } from '../../src/adapters/fakes/in-memory-repositories.js';
import { describeAllRepositoryContracts } from './all.contract.js';

describeAllRepositoryContracts('mémoire', async (clock) => createInMemoryRepositories(clock));
