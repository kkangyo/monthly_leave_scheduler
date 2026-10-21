import StoreRepository from '../model/storeRepository';
import { StoreEntity } from '../apis/auth/authEntities';
import { BadRequestError } from './error';

class SuperadminService {
  private readonly storeRepo = new StoreRepository();

  async createStore(storeCode: string, storeName: string): Promise<{ storeId: string }> {
    if (!storeCode || !storeName) throw new BadRequestError('storeCode, storeName 이 모두 필요합니다');
    if (!/^[a-zA-Z0-9_-]{2,50}$/.test(storeCode))
      throw new BadRequestError('storeCode 형식이 올바르지 않습니다(영문/숫자/-/_, 2~50자)');

    const existing = await this.storeRepo.getStoreByCode(storeCode);
    if (existing) throw new BadRequestError('이미 존재하는 매장 코드입니다');

    const storeId = await this.storeRepo.createStore(storeCode, storeName);
    return { storeId };
  }

  async listStores(): Promise<StoreEntity[]> {
    return this.storeRepo.getAllStores();
  }

  async deleteStore(storeId: string): Promise<void> {
    if (!storeId) throw new BadRequestError('storeId 가 필요합니다');
    const store = await this.storeRepo.getStoreById(storeId);
    if (!store) throw new BadRequestError('존재하지 않는 매장입니다');
    await this.storeRepo.deleteStore(storeId);
  }
}

export default SuperadminService;
