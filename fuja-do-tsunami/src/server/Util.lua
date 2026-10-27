-- Funções auxiliares para criar peças e placas flutuantes.

local Util = {}

function Util.part(props)
	local part = Instance.new("Part")
	part.Anchored = true
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	for key, value in pairs(props) do
		if key ~= "Parent" then
			part[key] = value
		end
	end
	part.Parent = props.Parent
	return part
end

function Util.billboard(adornee, text, color, offsetY, maxDistance, size)
	local gui = Instance.new("BillboardGui")
	gui.Name = "Placa"
	gui.Size = size or UDim2.fromOffset(220, 50)
	gui.StudsOffset = Vector3.new(0, offsetY or 3, 0)
	gui.MaxDistance = maxDistance or 200
	gui.LightInfluence = 0
	gui.Adornee = adornee

	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Text = text
	label.TextColor3 = color or Color3.new(1, 1, 1)
	label.TextStrokeTransparency = 0
	label.Font = Enum.Font.FredokaOne
	label.TextScaled = true
	label.Parent = gui

	gui.Parent = adornee
	return gui
end

function Util.pickWeighted(list)
	local total = 0
	for _, entry in ipairs(list) do
		total += entry.weight
	end
	local roll = math.random() * total
	for _, entry in ipairs(list) do
		roll -= entry.weight
		if roll <= 0 then
			return entry
		end
	end
	return list[#list]
end

return Util
