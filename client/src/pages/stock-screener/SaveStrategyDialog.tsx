import { useState } from 'react';
import { Save } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@client/src/components/ui/dialog';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import { Label } from '@client/src/components/ui/label';

interface SaveStrategyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string, description: string) => void;
}

export function SaveStrategyDialog({
  open,
  onOpenChange,
  onSave,
}: SaveStrategyDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim(), description.trim());
    setName('');
    setDescription('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save size={18} className="text-primary" />
            保存选股策略
          </DialogTitle>
          <DialogDescription>
            将当前筛选条件保存为策略，方便后续快速调用
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="strategy-name">策略名称</Label>
            <Input
              id="strategy-name"
              placeholder="请输入策略名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="strategy-desc">策略描述（可选）</Label>
            <Textarea
              id="strategy-desc"
              placeholder="简单描述这个选股策略的特点..."
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            保存策略
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
