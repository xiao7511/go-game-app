// CS1.6游戏大厅卡片 HTML
<div class='game-card'>
    <h3>CS1.6</h3>
    <select id='cs16-mode'>
        <option value='single'>单机版</option>
        <option value='multiplayer'>联机版</option>
    </select>
    <button id='launch-cs16'>拉起游戏</button>
</div>
<script>
    document.getElementById('launch-cs16').addEventListener('click', function() {
        const mode = document.getElementById('cs16-mode').value;
        fetch('/api/games/cs16/launch-config?mode=' + mode)
            .then(response => response.json())
            .then(data => {
                // 这里可以进一步处理返回的数据，如启动游戏
                console.log(data);
            })
            .catch(error => console.error('Error:', error));
    });
</script>