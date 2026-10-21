import { getProfile, getToken, notifyUnauthorized } from "./authToken";

const { REACT_APP_SERVER_PORT } = process.env;

// API 서버 호스트는 고정 IP 대신 지금 브라우저가 접속한 주소를 그대로 쓴다.
//  localhost 로 열든, 외부 IP/도메인으로 열든 항상 같은 호스트의 서버를 가리켜서
//  배포 환경(오라클 인스턴스 IP 등)이 바뀔 때마다 설정을 다시 하고 재시작할 필요가 없다.
const apiHost =
  typeof window !== "undefined" && window.location?.hostname
    ? window.location.hostname
    : "localhost";

// 로그인 토큰이 있으면 Authorization 헤더로 자동 첨부. 서버가 401 을 주면(토큰 없음/만료)
// 전역 로그아웃 리스너를 호출해서 로그인 화면으로 돌아가게 한다.
// X-Store-Id 는 슈퍼관리자 토큰일 때만 서버가 읽는다(매장 계정은 토큰의 storeId 고정, 헤더 무시).
const authHeaders = (): Record<string, string> => {
  const token = getToken();
  if (!token) return {};
  const storeId = getProfile()?.storeId;
  return storeId
    ? { Authorization: `Bearer ${token}`, "X-Store-Id": storeId }
    : { Authorization: `Bearer ${token}` };
};

const handleResponse = async (res: Response) => {
  if (res.status === 401) notifyUnauthorized();
  return res.json();
};

export class HTTP {
  private domain: string = "";

  constructor(domain: string) {
    this.domain = domain;
  }

  async get(api: string) {
    return fetch(`${this.domain}${api}`, {
      headers: { ...authHeaders() },
    }).then(handleResponse);
  }

  async post(api: string, data: any) {
    return fetch(`${this.domain}${api}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify(data),
    }).then(handleResponse);
  }

  async put(api: string, data: any) {
    return fetch(`${this.domain}${api}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify(data),
    }).then(handleResponse);
  }

  async delete(api: string, data: any) {
    return fetch(`${this.domain}${api}`, {
      method: "DELETE",
      headers: { ...authHeaders() },
      ...data,
    }).then(handleResponse);
  }

  async patch(api: string, data: any) {
    return fetch(`${this.domain}${api}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify(data),
    }).then(handleResponse);
  }

}

const instance = new HTTP(`http://${apiHost}:${REACT_APP_SERVER_PORT}`);

export default instance;
