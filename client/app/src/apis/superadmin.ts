import instance from "./instance";

export interface StoreSummary {
  store_id: string;
  store_code: string;
  store_name: string;
  created_at?: string;
  agent_count?: number;
  account_count?: number;
}

// 슈퍼관리자 전용 매장 관리 API — 서버가 토큰 종류(superadmin)로 한 번 더 막는다.
class SuperadminHTTP {
  private instance = instance;

  async listStores() {
    return await this.instance.get("/apis/superadmin/stores");
  }

  async createStore(storeCode: string, storeName: string) {
    return await this.instance.post("/apis/superadmin/stores", { storeCode, storeName });
  }

  async deleteStore(storeId: string) {
    return await this.instance.delete(`/apis/superadmin/stores/${storeId}`, {});
  }
}

const superadminAPI = new SuperadminHTTP();

export default superadminAPI;
