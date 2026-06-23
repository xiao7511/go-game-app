package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

// LaunchConfigResponse 定义返回的 JSON 结构
type LaunchConfigResponse struct {
	LaunchUrl string `json:"launchUrl"`
}

func handleCS16LaunchConfig(w http.ResponseWriter, r *http.Request) {
	// 设置允许跨域和 JSON 格式
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")
	
	mode := r.URL.Query().Get("mode")
	
	if mode == "multiplayer" {
		// 💡 联机版分发的服务器 IP（可根据实际情况修改）
		serverIP := "47.100.x.x:27015" 
		response := LaunchConfigResponse{
			LaunchUrl: "cs16://connect/" + serverIP,
		}
		json.NewEncoder(w).Encode(response)
		return
	}
	
	response := LaunchConfigResponse{LaunchUrl: "cs16://"}
	json.NewEncoder(w).Encode(response)
}

func main() {
	// 1. 🎮 注册联机配置接口
	http.HandleFunc("/api/games/cs16/launch-config", handleCS16LaunchConfig)
	
	// 2. 🌐 核心修复：托管当前目录下的网页静态文件（HTML/JS/图片等）
	// "." 代表当前 Go 运行的目录，它会自动寻找该目录下的 index.html 作为首页展现
	fileServer := http.FileServer(http.Dir("."))
	http.Handle("/", fileServer)
	
	fmt.Println("======================================================")
	fmt.Println(" 🎮 大厅全栈后端已就绪！")
	fmt.Println(" 👉 请在浏览器访问: http://127.0.0.1:8080")
	fmt.Println("======================================================")
	
	// 3. 监听本地，绕过防火墙
	err := http.ListenAndServe("127.0.0.1:8080", nil)
	if err != nil {
		log.Fatal(err)
	}
}