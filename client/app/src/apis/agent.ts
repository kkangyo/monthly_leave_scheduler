import instance from "./instance";

class AgentinfoHTTP {
  private instance = instance;

  async getAgentCount() {
    return await this.instance.get("/apis/agentinfo/count");
  }

  async getAgentinfo() {
    return await this.instance.get("/apis/agentinfo/infos");
  }

  async createAgentinfo(body: any) {
    return await this.instance.post("/apis/agentinfo/infos", body);
  }

  async updateAgentinfo(agentid:string, body: any) {
    return await this.instance.patch(`/apis/agentinfo/infos/${agentid}`, body);
  }

  async deleteAgentinfo(agentid:string, body: any) {
    return await this.instance.delete(`/apis/agentinfo/infos/${agentid}`, body);
  }

  async confirmMonthlySchedule(body: any) {
    return await this.instance.post("/apis/agentinfo/schedule/confirm", body);
  }

  async getAnnualLeaveUsage(month: string) {
    return await this.instance.get(`/apis/agentinfo/annual-leave/usage?month=${month}`);
  }

  async resetMonthlyScheduleTable() {
    return await this.instance.post("/apis/agentinfo/schedule/reset", {});
  }

  async getMonthlySchedule(month: string) {
    return await this.instance.get(`/apis/agentinfo/schedule?month=${month}`);
  }

  async getSettings() {
    return await this.instance.get("/apis/agentinfo/settings");
  }

  async updateSettings(body: any) {
    return await this.instance.put("/apis/agentinfo/settings", body);
  }
}

const agentAPI = new AgentinfoHTTP();

export default agentAPI;
