import instance from "./instance";

class AuthHTTP {
  private instance = instance;

  async login(storeCode: string, loginId: string, password: string) {
    return await this.instance.post("/apis/auth/login", { storeCode, loginId, password });
  }

  async createAccount(agentId: string, loginId: string, password: string) {
    return await this.instance.post("/apis/auth/accounts", { agentId, loginId, password });
  }

  async resetPassword(agentId: string, password: string) {
    return await this.instance.patch(`/apis/auth/accounts/${agentId}`, { password });
  }
}

const authAPI = new AuthHTTP();

export default authAPI;
