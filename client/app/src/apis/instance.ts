const { REACT_APP_SERVER_PORT } = process.env;

// API 서버 호스트는 고정 IP 대신 지금 브라우저가 접속한 주소를 그대로 쓴다.
//  localhost 로 열든, 외부 IP/도메인으로 열든 항상 같은 호스트의 서버를 가리켜서
//  배포 환경(오라클 인스턴스 IP 등)이 바뀔 때마다 REACT_APP_HOST_ADDRESS 를 다시 설정하고
//  재시작할 필요가 없다.
const apiHost =
  typeof window !== "undefined" && window.location?.hostname
    ? window.location.hostname
    : "localhost";

export class HTTP {
  private domain: string = "";

  constructor(domain: string) {
    this.domain = domain;
  }

  async get(api: string) {
    return await fetch(`${this.domain}${api}`).then((res) => res.json());
  }

  async post(api: string, data: any) {
    return await fetch(`${this.domain}${api}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }).then((res) => res.json());
  }

  async put(api: string, data: any) {
    return await fetch(`${this.domain}${api}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }).then((res) => res.json());
  }

  async delete(api: string, data: any) {
    return await fetch(`${this.domain}${api}`, {
      method: "DELETE",
      ...data,
    }).then((res) => res.json());
  }

  // async patch(api: string) {
  //   return await fetch(`${this.domain}${api}`, {
  //     method: "PATCH",
  //   }).then((res) => res.json());
  // }

  async patch(api: string, data: any) {
    return await fetch(`${this.domain}${api}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }).then((res) => res.json());
  }

}

const instance = new HTTP(`http://${apiHost}:${REACT_APP_SERVER_PORT}`);

export default instance;
