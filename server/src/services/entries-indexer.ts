import { AsyncDisposer } from '../common/disposable';
import { AsyncEnumerable } from '../common/enumerable';
import { Logger } from '../common/logger';
import { AggregatedEntry } from '../common/model';
import { SearchEngine } from '../common/search-engine';
import { timeout } from '../common/utils';
import { keys } from '../keys';
import { Job, Queue, QueueProvider } from '../queue';
import { AggregatedEntryRepository } from '../repository';
import { Service, ServiceMetric, ServiceMetricType } from './service';
import { ServiceBase } from './service-base';

const BATCH_SIZE = 100;

export class EntriesIndexerService extends ServiceBase implements Service {
  private readonly aggregatedEntryRepository: AggregatedEntryRepository;
  private readonly searchEngine: SearchEngine<AggregatedEntry>;
  private readonly queueProvider: QueueProvider;
  private readonly logger: Logger;

  private indexed: number;

  get metrics(): ServiceMetric[] {
    return [{ name: 'indexed', type: ServiceMetricType.Counter, value: this.indexed }];
  }

  constructor(indexedEntryRepository: AggregatedEntryRepository, searchEngine: SearchEngine<AggregatedEntry>, queueProvider: QueueProvider, logger: Logger) {
    super();

    this.aggregatedEntryRepository = indexedEntryRepository;
    this.searchEngine = searchEngine;
    this.queueProvider = queueProvider;
    this.logger = logger;

    this.indexed = 0;
  }

  protected async run(): Promise<void> {
    const disposer = new AsyncDisposer();
    const entriesToBeIndexedQueue = this.queueProvider.get<string>(keys.EntriesToBeIndexed, 15000, 3);

    await this.initializeQueues(disposer, entriesToBeIndexedQueue);

    const consumer = entriesToBeIndexedQueue.getBatchConsumer(BATCH_SIZE, this.cancellationToken);

    await AsyncEnumerable.from(consumer)
      .forEach(async (batch) => {
        try {
          await this.indexBatch(batch);
          await entriesToBeIndexedQueue.acknowledge(...batch);

          this.indexed += batch.length;
        }
        catch (error) {
          this.logger.error(error as Error);
          await timeout(2500);
        }
      });

    await disposer.dispose();
  }

  private async indexBatch(batch: Job<string>[]): Promise<void> {
    const ids = batch.map((job) => job.data);
    await this.indexEntries(ids);
  }

  private async indexEntries(ids: string[]): Promise<void> {
    const entries = this.aggregatedEntryRepository.loadMany(ids);
    const entriesArray = await AsyncEnumerable.from(entries).toArray();
    const searchEngineItems = entriesArray.map((entry) => ({ id: entry.id, document: entry }));

    await this.searchEngine.index(searchEngineItems);
  }

  private async initializeQueues(disposer: AsyncDisposer, ...queues: Queue<any>[]): Promise<void> {
    for (const queue of queues) {
      await queue.initialize();
      disposer.addDisposeTasks(async () => await queue.dispose());
    }
  }
}
